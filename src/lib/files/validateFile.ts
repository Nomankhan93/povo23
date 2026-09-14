export async function validateFile(file: File) {
  if (file.size < 1 || file.size > 5242880)
    throw Error("Choose a file up to 5 MiB.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const type =
    bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70
      ? "application/pdf"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71 &&
            bytes[4] === 13 &&
            bytes[5] === 10 &&
            bytes[6] === 26 &&
            bytes[7] === 10
          ? "image/png"
          : null;
  if (!type) throw Error("Choose a PDF, JPG or PNG file.");
  return type;
}
