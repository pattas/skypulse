import type { Map } from 'maplibre-gl';

const ICON_SIZE = 48;
const ICON_NAME = 'aircraft-icon';

const AIRCRAFT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M24 4 L26.5 10 L26.5 28 L26 40 L24 44 L22 40 L21.5 28 L21.5 10 Z" fill="white"/>
  <path d="M21.5 20 L6 28 L6 31 L21.5 27 Z" fill="white"/>
  <path d="M26.5 20 L42 28 L42 31 L26.5 27 Z" fill="white"/>
  <path d="M22 38 L16 42 L16 44 L22 40 Z" fill="white"/>
  <path d="M26 38 L32 42 L32 44 L26 40 Z" fill="white"/>
</svg>`;

export function registerAircraftIcon(map: Map): Promise<void> {
  return new Promise((resolve) => {
    if (map.hasImage(ICON_NAME)) {
      resolve();
      return;
    }

    const img = new Image(ICON_SIZE, ICON_SIZE);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);
      const imageData = ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);

      if (!map.hasImage(ICON_NAME)) {
        map.addImage(ICON_NAME, {
          width: ICON_SIZE,
          height: ICON_SIZE,
          data: new Uint8Array(imageData.data.buffer),
        }, { sdf: true });
      }
      resolve();
    };

    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(AIRCRAFT_SVG);
  });
}

export { ICON_NAME };
