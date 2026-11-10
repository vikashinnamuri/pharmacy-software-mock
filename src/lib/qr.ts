import qrcode from "qrcode-generator";

/** QR module matrix for a short, non-sensitive identifier. */
export function qrMatrix(text: string) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const size = q.getModuleCount();
  return { size, dark: (row: number, col: number) => q.isDark(row, col) };
}
