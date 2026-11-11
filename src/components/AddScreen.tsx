'use client'

import { useRef, useState } from 'react'
import type { Item } from '@/lib/types'
import { uploadImage } from '@/lib/data'
import type { ItemTags } from '@/lib/tagging'
import { CATEGORY_LABEL } from '@/lib/display'
import { ItemEditor, fromEditable, toEditable, type EditableItem } from './ItemEditor'

type Stage = 'queued' | 'uploading' | 'tagging' | 'ready' | 'error'

interface Row {
  key: string
  file: File
  preview: string
  stage: Stage
  url?: string
  tags?: ItemTags
  /** 用户改过的字段；没改就沿用它，省得每次重新拼 */
  draft?: EditableItem
  /** 是否展开编辑面板 */
  editing?: boolean
  error?: string
}

/** 把识别结果转成可编辑字段 */
function rowToEditable(row: Row): EditableItem {
  const t = row.tags
  if (!t) return toEditable({})
  return {
    name: t.subcategory || '',
    category: t.category,
    gender: 'unisex',
    color_hex: t.color_hex,
    color_name: t.color_name,
    material: t.material,
    formality: t.formality,
    warmth: t.warmth,
    season: t.season,
    style_tags: t.style_tags,
  }
}

/**
 * 入库：批量选图 → 逐张上传 → 后台打标 → 确认。
 * 关键：上传完立刻可以选下一批，不要让用户等模型。
 */
export function AddScreen({
  demo,
  onCreate,
  onDone,
}: {
  demo: boolean
  onCreate: (patch: Partial<Item> & { category: Item['category'] }) => Promise<void>
  onDone: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const native = isNativeApp()

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const next: Row[] = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
      stage: 'queued',
    }))
    setRows((r) => [...next, ...r])
    setBusy(true)

    for (const row of next) {
      await processRow(row)
    }
    setBusy(false)
  }

  /** 原生拍照/选相册。Web 走 hidden input，这条路不会进来。 */
  async function handleNativePick(source: 'camera' | 'photos') {
    if (picking) return
    setPicking(true)
    try {
      const picked = await pickNativeImages(source)
      if (picked.length === 0) return // 用户取消
      const next: Row[] = picked.map(({ file, preview }) => ({
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview,
        stage: 'queued',
      }))
      setRows((r) => [...next, ...r])
      setBusy(true)
      for (const row of next) {
        await processRow(row)
      }
      setBusy(false)
    } catch (e) {
      setRows((rs) => rs) // 不改状态，让下面的提示走 toast 一样的路子
      console.error('[拍照失败]', e)
    } finally {
      setPicking(false)
    }
  }

  async function processRow(row: Row) {
    try {
      patch(row.key, { stage: 'uploading' })
      const url = demo ? row.preview : await uploadImage(row.file)
      patch(row.key, { stage: 'tagging', url })

      // 打标：配了就调，没配就留空等手动
      try {
        const res = await fetch('/api/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: url }),
        })
        if (!res.ok) throw new Error('no tags')
        const j = await res.json()
        patch(row.key, { stage: 'ready', tags: j.tags })
      } catch {
        patch(row.key, { stage: 'ready' })
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : ''
      // Supabase / 网络层抛的是英文技术细节，直接展示给用户看不懂。
      // 有中文就照用，没有就换一句人话，原始信息留给控制台。
      const hasChinese = /[\u4e00-\u9fa5]/.test(raw)
      if (!hasChinese && raw) console.error('[上传失败]', raw)
      patch(row.key, {
        stage: 'error',
        error: hasChinese ? raw : '这张没传上去，删掉重试一次',
      })
    }
  }

  function patch(key: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  }

  async function save(row: Row) {
    const t = row.tags
    // 用户改过就用改过的，没改就用识别结果
    const e = row.draft ?? rowToEditable(row)
    await onCreate({
      ...fromEditable(e),
      category: e.category,
      // 识别出来的细分品类、版型这些保留下来
      subcategory: t?.subcategory || e.name || null,
      pattern: t?.pattern ?? 'solid',
      fit: t?.fit ?? 'regular',
      secondary_colors: t?.secondary_colors ?? [],
      image_url: row.url ?? null,
    })
    setRows((rs) => rs.filter((r) => r.key !== row.key))
  }

  const readyCount = rows.filter((r) => r.stage === 'ready').length

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <button
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-2xl border-2 border-dashed border-[#cfc9bf] bg-card py-9 text-center active:bg-accentSoft active:border-accent transition"
      >
        <div className="text-3xl mb-2">📷</div>
        <div className="text-sm font-semibold">拍照 / 选择照片</div>
        <div className="text-xs text-ink3 mt-1.5">支持一次选多张 · 自动压缩 · 后台识别</div>
      </button>

      <div className="mt-4 rounded-xl bg-[#fffdf6] border border-[#efe7d2] px-4 py-3">
        <h4 className="text-xs font-bold text-warn mb-1.5 tracking-wide">
          拍好一张，识别准确率差 3 倍
        </h4>
        <ul className="text-xs text-ink2 leading-relaxed list-disc pl-4 space-y-0.5">
          <li>纯色背景：白床单、白墙、衣柜门</li>
          <li>自然光或白光，别用黄光灯</li>
          <li>一件一张，平铺或正面挂拍</li>
          <li>iPhone 可长按主体直接抠图再导入</li>
        </ul>
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-5 mb-2.5">
            <span className="text-xs font-bold text-ink3 tracking-wide">
              待确认 {readyCount} / {rows.length} 件
            </span>
            {busy && <span className="text-[11px] text-ink3">处理中…</span>}
          </div>

          <div className="space-y-2.5">
            {rows.map((r) => (
              <RowCard
                key={r.key}
                row={r}
                onSave={() => save(r)}
                onDrop={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                onEdit={(row, patch) =>
                  setRows((rs) => rs.map((x) => (x.key === row.key ? { ...x, ...patch } : x)))
                }
              />
            ))}
          </div>
        </>
      )}

      {rows.length === 0 && (
        <div className="mt-6 text-center">
          <button onClick={onDone} className="text-sm text-ink3 underline underline-offset-4">
            返回衣柜
          </button>
        </div>
      )}
    </div>
  )
}

function RowCard({
  row,
  onSave,
  onDrop,
  onEdit,
}: {
  row: Row
  onSave: () => void
  onDrop: () => void
  onEdit: (row: Row, patch: Partial<Row>) => void
}) {
  const t = row.tags
  const draft = row.draft ?? (row.stage === 'ready' ? rowToEditable(row) : undefined)
  const tagline = draft
    ? `${CATEGORY_LABEL[draft.category]} · ${draft.material || '—'} · ${draft.style_tags.join('/') || '—'}`
    : ''
  const edited = Boolean(row.draft)

  return (
    <div className="rounded-xl bg-card border border-line p-2.5">
      <div className="flex gap-3 items-center">
        <div
          className="w-12 h-14 rounded-lg shrink-0 grid place-items-center overflow-hidden relative"
          style={{ background: draft ? tintOfLocal(draft.color_hex) : '#f4f2ee' }}
        >
          {row.stage === 'ready' && draft ? (
            <span
              className="w-5 h-5 rounded-[5px] shadow-[inset_0_-5px_10px_rgba(0,0,0,.18)]"
              style={{ background: draft.color_hex }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.preview} alt="" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold truncate">
            {draft?.name || t?.subcategory || row.file.name.replace(/\.[^.]+$/, '')}
            {edited && <span className="ml-1 text-[10px] text-accent">已改</span>}
          </div>
          <div className="text-[10.5px] text-ink3 mt-0.5 truncate">
            {row.stage === 'uploading' && '上传中…'}
            {row.stage === 'tagging' && '识别中…'}
            {row.stage === 'queued' && '排队中…'}
            {row.stage === 'error' && <span className="text-warn">{row.error}</span>}
            {row.stage === 'ready' && (tagline || '等待手动填写')}
          </div>
        </div>

        {row.stage === 'ready' ? (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => onEdit(row, { editing: !row.editing })}
              className={`text-[10px] px-2 py-1.5 rounded-full font-semibold ${
                row.editing ? 'bg-ink text-white' : 'bg-[#f2f0ec] text-ink2'
              }`}
            >
              {row.editing ? '收起' : '改一下'}
            </button>
            <button
              onClick={onDrop}
              className="text-[10px] px-2 py-1.5 rounded-full bg-[#f2f0ec] text-ink2 font-semibold"
            >
              删
            </button>
            <button
              onClick={onSave}
              className="text-[10px] px-2.5 py-1.5 rounded-full bg-accent text-white font-semibold active:scale-95 transition"
            >
              确认
            </button>
          </div>
        ) : (
          <span
            className={`text-[10px] px-2.5 py-1 rounded-full font-semibold shrink-0 ${
              row.stage === 'tagging' ? 'bg-[#fdf3e7] text-[#a9702a]' : 'bg-[#eef4f1] text-accent'
            }`}
          >
            {row.stage === 'tagging' ? '打标中' : row.stage === 'error' ? '失败' : '…'}
          </span>
        )}
      </div>

      {row.editing && draft && (
        <div className="mt-3 pt-3 border-t border-line">
          <ItemEditor
            value={draft}
            onChange={(patch) => onEdit(row, { draft: { ...draft, ...patch } })}
            autoHint
          />
        </div>
      )}
    </div>
  )
}

function tintOfLocal(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c * 0.12 + 248 * 0.88)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}
