export function shouldBookCapturePointer(pointerType: string | undefined): boolean {
  return pointerType === undefined || pointerType === '' || pointerType === 'mouse'
}
