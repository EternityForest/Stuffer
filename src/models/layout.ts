export interface StickerLayout {
  id: string;
  name: string;
  pageSizeWidth: number; // in mm
  pageSizeHeight: number; // in mm
  leftMargin: number; // in mm
  topMargin: number; // in mm
  rowCount: number;
  colCount: number;
  stickerWidth: number; // in mm
  stickerHeight: number; // in mm
  horizontalGap: number; // in mm
  verticalGap: number; // in mm
  description: string;
}
