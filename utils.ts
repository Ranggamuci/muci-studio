import { CameraShot } from './types';

export function shuffleArray<T>(array: T[]): T[] {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
}

export function generateRandomFilename(prefix = 'prewedding', extension = 'jpeg'): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomString = '';
    for (let i = 0; i < 12; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}_${randomString}.${extension}`;
}

/**
 * Crops an image to a specific aspect ratio from the center.
 * This function no longer handles different camera shots, as that is now controlled by the AI prompt.
 * @param imageBlob The source image blob.
 * @param targetAspectRatio The desired aspect ratio (e.g., 4/5, 1, 16/9).
 * @returns A promise that resolves to the cropped image blob.
 */
export function cropImage(imageBlob: Blob, targetAspectRatio: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const imageUrl = URL.createObjectURL(imageBlob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                URL.revokeObjectURL(imageUrl);
                return reject(new Error("Failed to get canvas context"));
            }

            let srcX = 0;
            let srcY = 0;
            let srcWidth = img.width;
            let srcHeight = img.height;
            const currentAspectRatio = img.width / img.height;

            if (currentAspectRatio > targetAspectRatio) {
                // Image is wider than target, so crop the sides.
                srcWidth = img.height * targetAspectRatio;
                srcX = (img.width - srcWidth) / 2;
            } else if (currentAspectRatio < targetAspectRatio) {
                // Image is taller than target, so crop the top and bottom.
                srcHeight = img.width / targetAspectRatio;
                srcY = (img.height - srcHeight) / 2;
            }
            // If aspect ratios match, no cropping is needed from a dimensional standpoint (srcX/Y remain 0).

            // Define the target for the longest edge of the image, aiming for 4K quality.
            const TARGET_LONG_EDGE = 3840;

            // Set the canvas size based on the target aspect ratio to achieve 4K-like resolution.
            if (targetAspectRatio <= 1) { // Portrait or Square
                canvas.height = TARGET_LONG_EDGE;
                canvas.width = TARGET_LONG_EDGE * targetAspectRatio;
            } else { // Landscape
                canvas.width = TARGET_LONG_EDGE;
                canvas.height = TARGET_LONG_EDGE / targetAspectRatio;
            }


            // Draw the cropped section of the image onto the canvas.
            ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Canvas to Blob conversion failed"));
                }
            }, 'image/jpeg', 1.0); // Use maximum quality JPEG
            
            URL.revokeObjectURL(imageUrl);
        };
        img.onerror = () => {
             URL.revokeObjectURL(imageUrl);
             reject(new Error("Image failed to load for cropping"));
        }
        img.src = imageUrl;
    });
}

/**
 * Selects a random item from an array, ensuring it hasn't been used before in the current session.
 * @param array The source array of items.
 * @param usedSet A Set containing items that have already been used.
 * @returns A unique item from the array, or undefined if the array is empty.
 */
export function getRandomUnique<T>(array: T[], usedSet: Set<T>): T | undefined {
    if (array.length === 0) return undefined;
    
    let availableItems = array.filter(item => !usedSet.has(item));

    // If all items have been used, reset the set and start over.
    if (availableItems.length === 0) {
        usedSet.clear();
        availableItems = array;
    }

    const randomIndex = Math.floor(Math.random() * availableItems.length);
    const selectedItem = availableItems[randomIndex];
    
    // Add the selected item to the used set.
    usedSet.add(selectedItem);
    
    return selectedItem;
}