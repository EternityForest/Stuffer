export interface StickerLayout {
  id: string;
  name: string;
  pageSizeWidth: number; // in mm
  pageSizeHeight: number; // in mm
  leftMargin: number; // in mm
  topMargin: number; // in mm
  rightMargin: number|null; // in mm
  bottomMargin: number|null; // in mm
  rowCount: number;
  colCount: number;
  stickerWidth: number; // in mm
  stickerHeight: number; // in mm
  stickerMargin: number; // in mm
  horizontalGap: number | null; // in mm
  verticalGap: number | null; // in mm
  description: string;
}
