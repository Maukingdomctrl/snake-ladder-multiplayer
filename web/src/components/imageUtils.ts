// Photos are stored inside the chat message itself (no paid file storage
// needed), so they are shrunk to a small JPEG first.
const MAX_SIDE = 1280;
const MAX_CHARS = 400_000; // ~300 KB of JPEG, well under Firestore's 1 MB doc limit

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    img.src = url;
  });
}

export async function compressImage(file: File): Promise<string> {
  const img = await loadImage(file);
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // transparent PNGs would otherwise turn black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", attempt < 3 ? 0.8 : 0.65);
    if (data.length <= MAX_CHARS) return data;
    side = Math.round(side * 0.75);
  }
  throw new Error("That image is too large to share.");
}
