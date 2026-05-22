/**
 * Compresses an image file using HTML5 Canvas.
 * Supports JPEG and PNG outputs. JPEG supports lossy quality compression.
 *
 * @param file The original image File.
 * @param quality Compression quality between 0.0 and 1.0 (default 0.75).
 * @param maxWidth Maximum width of the output image (default 1200).
 * @param maxHeight Maximum height of the output image (default 1200).
 * @param keepPng If true, preserves PNG format and transparency (avoids converting to JPEG).
 * @returns A promise that resolves to the compressed File (or original if compression is not beneficial or supported).
 */
export function compressImage(
  file: File,
  quality = 0.75,
  maxWidth = 1200,
  maxHeight = 1200,
  keepPng = false
): Promise<File> {
  // Return early if not a browser environment or not an image file
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return Promise.resolve(file);
  }

  // GIFs (could be animated) shouldn't be processed with Canvas as it will strip animation
  if (file.type === "image/gif") {
    return Promise.resolve(file);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          // Scale down if dimensions exceed maximum while preserving aspect ratio
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(file);
            return;
          }

          const exportAsPng = keepPng && file.type === "image/png";
          const outputType = exportAsPng ? "image/png" : "image/jpeg";

          // If exporting as JPEG, fill background with white to avoid black background on transparent PNGs/WEBP
          if (outputType === "image/jpeg") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert canvas to Blob, then back to File
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }

              // Safeguard: Only return compressed file if it's actually smaller in size
              if (blob.size >= file.size) {
                resolve(file);
              } else {
                const compressedFile = new File([blob], file.name, {
                  type: outputType,
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              }
            },
            outputType,
            outputType === "image/jpeg" ? quality : undefined
          );
        } catch (err) {
          console.error("Image compression error:", err);
          resolve(file);
        }
      };

      img.onerror = () => {
        resolve(file);
      };
    };

    reader.onerror = () => {
      resolve(file);
    };
  });
}
