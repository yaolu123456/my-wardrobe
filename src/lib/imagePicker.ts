'use client'

import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

/**
 * 选图统一入口。
 *
 * 为什么要这个模块：
 *   Android WebView 里 `<input type="file" capture="environment">` 的 `capture`
 *   属性是无效的 —— 点下去只会开文件选择器，不会开相机。想真的拍照必须走
 *   原生 Camera 插件。
 *
 * 环境分流：
 *   原生（APK）→ @capacitor/camera，能选"拍照"还是"从相册选"
 *   Web（浏览器）→ 浏览器自己的文件选择器，手机上系统会给"拍照/相册"选项
 */

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** dataURL → File，好复用现有的上传流程 */
async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const ext = (blob.type.split('/')[1] ?? 'jpeg').replace('jpeg', 'jpg')
  return new File([blob], `${name}.${ext}`, { type: blob.type || 'image/jpeg' })
}

export interface PickedImage {
  file: File
  /** objectURL，给预览用；调用方负责 revoke */
  preview: string
}

export type PickSource = 'camera' | 'photos'

/**
 * 原生环境下拍照或选相册。返回空数组表示用户取消了。
 *
 * 注意：Camera 插件一次只能拿一张。要批量导入用户得重复点，或者走相册多选。
 * 这里选择「一次一张」—— 拍衣服本来就是一件一张，批量反而容易拍糊。
 */
export async function pickNativeImages(source: PickSource): Promise<PickedImage[]> {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      // DataUrl 而不是 Uri：Uri 在 WebView 里要额外转换，还涉及 FileProvider 路径，
      // 直接拿 base64 最省事，反正后面还要压缩上传。
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      // 衣服照片不需要宽高比限制
      width: 1600,
      correctOrientation: true,
    })

    if (!photo.dataUrl) return []
    const file = await dataUrlToFile(photo.dataUrl, `photo-${Date.now()}`)
    return [{ file, preview: URL.createObjectURL(file) }]
  } catch (e) {
    // 用户取消时插件会抛错，这不是故障，静默返回空
    const msg = e instanceof Error ? e.message : String(e)
    if (/cancel|canceled|cancelled/i.test(msg)) return []
    throw e
  }
}

/** 当前是否支持拍照（原生才有） */
export function canTakePhoto(): boolean {
  return isNativeApp()
}
