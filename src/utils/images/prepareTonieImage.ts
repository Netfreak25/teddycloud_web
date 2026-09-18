export const TONIE_USER_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
export const TONIE_USER_IMAGE_SIZE = 512;

/** Fit the whole image on a transparent square, including small source images. */
export const tonieImageBounds = (width: number, height: number) => {
    if (!(width > 0 && height > 0)) throw new Error("Invalid image dimensions");
    const scale = TONIE_USER_IMAGE_SIZE / Math.max(width, height);
    const fittedWidth = width * scale;
    const fittedHeight = height * scale;
    return {
        x: (TONIE_USER_IMAGE_SIZE - fittedWidth) / 2,
        y: (TONIE_USER_IMAGE_SIZE - fittedHeight) / 2,
        width: fittedWidth,
        height: fittedHeight,
    };
};

/** Browser decoding handles EXIF orientation and the default/first animation frame. */
export const prepareTonieImage = async (file: File): Promise<File> => {
    if (file.size > TONIE_USER_IMAGE_MAX_SIZE) {
        throw new Error("tonies.editModal.customImageTooLarge");
    }
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
        throw new Error("tonies.editModal.customImageInvalidFormat");
    }
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
        const bounds = tonieImageBounds(bitmap.width, bitmap.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = TONIE_USER_IMAGE_SIZE;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height);
        const png = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
                "image/png",
            ),
        );
        if (png.size > TONIE_USER_IMAGE_MAX_SIZE) {
            throw new Error("tonies.editModal.customImageTooLarge");
        }
        return new File([png], file.name.replace(/\.[^.]+$/, ".png"), { type: "image/png" });
    } finally {
        bitmap.close();
    }
};
