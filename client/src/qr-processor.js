import jsQR from 'jsqr';

/**
 * Internal helper to scan a specific canvas
 */
const scanCanvas = (canvas) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
};

/**
 * Apply contrast and thresholding to a canvas
 */
const preprocessCanvas = (canvas, threshold = 128, contrast = 1.5) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    // Grayscale
    const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    
    // Contrast
    let val = factor * (avg - 128) + 128;
    
    // Threshold
    val = val < threshold ? 0 : 255;
    
    data[i] = data[i+1] = data[i+2] = val;
  }
  ctx.putImageData(imageData, 0, 0);
};

export const processQRCodeImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const stages = [
          // Stage 1: Raw Full-Scale Scan
          { name: 'Raw Full', scale: 1, crop: null, preprocess: false },
          
          // Stage 2: Balanced Downscale (Optimal for jsQR)
          { name: 'Downscaled', scale: 1000 / Math.max(img.width, img.height), crop: null, preprocess: false },
          
          // Stage 3: Center Crops (Mobile Screenshots)
          { name: 'Center 70%', scale: 1, crop: { size: 0.7, x: 0.15, y: 0.15 }, preprocess: false },
          { name: 'Center 50%', scale: 1, crop: { size: 0.5, x: 0.25, y: 0.25 }, preprocess: false },

          // Stage 4: High Contrast Full
          { name: 'High Contrast', scale: 0.8, crop: null, preprocess: true, threshold: 128 },
          { name: 'Dark Threshold', scale: 0.8, crop: null, preprocess: true, threshold: 80 },
          { name: 'Light Threshold', scale: 0.8, crop: null, preprocess: true, threshold: 180 },

          // Stage 5: Quadrant Hunt (If QR is in a corner)
          { name: 'Top Left', scale: 1, crop: { size: 0.5, x: 0, y: 0 }, preprocess: false },
          { name: 'Top Right', scale: 1, crop: { size: 0.5, x: 0.5, y: 0 }, preprocess: false },
          { name: 'Bottom Left', scale: 1, crop: { size: 0.5, x: 0, y: 0.5 }, preprocess: false },
          { name: 'Bottom Right', scale: 1, crop: { size: 0.5, x: 0.5, y: 0.5 }, preprocess: false },
        ];

        let code = null;

        for (const stage of stages) {
          try {
            const sw = stage.crop ? img.width * stage.crop.size : img.width;
            const sh = stage.crop ? img.height * stage.crop.size : img.height;
            const sx = stage.crop ? img.width * stage.crop.x : 0;
            const sy = stage.crop ? img.height * stage.crop.y : 0;

            const targetWidth = sw * (stage.scale || 1);
            const targetHeight = sh * (stage.scale || 1);
            
            // Skip stages if scale results in too small an image
            if (targetWidth < 50 || targetHeight < 50) continue;

            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            if (stage.preprocess) {
              preprocessCanvas(canvas, stage.threshold || 128);
            }

            code = scanCanvas(canvas);
            if (code) {
              console.log(`✅ QR found in stage: ${stage.name}`);
              break;
            }
          } catch (err) {
            console.warn(`Stage ${stage.name} failed:`, err);
          }
        }

        if (code) {
          const info = identifyLinkType(code.data);
          resolve({
            url: code.data,
            ...info
          });
        } else {
          reject(new Error('No QR code found after multi-stage scanning.'));
        }
      };
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
};

/**
 * Identify the platform and metadata from a URL
 * @param {string} url 
 */
export const identifyLinkType = (url) => {
  const patterns = [
    { name: 'LinkedIn', icon: '💼', type: 'social', regex: /linkedin\.com|lnk\.d|lnkd\.in/i },
    { name: 'Instagram', icon: '📸', type: 'social', regex: /instagram\.com|instagr\.am/i },
    { name: 'GitHub', icon: '💻', type: 'social', regex: /github\.com/i },
    { name: 'Twitter', icon: '🐦', type: 'social', regex: /twitter\.com|x\.com|t\.co/i },
    { name: 'YouTube', icon: '🎥', type: 'social', regex: /youtube\.com|youtu\.be/i },
    { name: 'Facebook', icon: '👥', type: 'social', regex: /facebook\.com|fb\.me/i },
    { name: 'Discord', icon: '💬', type: 'social', regex: /discord\.gg|discord\.com/i },
    { name: 'Venmo', icon: '💸', type: 'payment', regex: /venmo\.com/i },
    { name: 'PayPal', icon: '💳', type: 'payment', regex: /paypal\.(me|com)/i },
    { name: 'Portfolio', icon: '🌐', type: 'link', regex: /https?:\/\/[^/]+(?:\.[^/]+)+/i },
    { name: 'WiFi', icon: '📶', type: 'wifi', regex: /^WIFI:/i },
    { name: 'Bank Card', icon: '💳', type: 'BANK_CARD', regex: /^OMNIQR:CARD:/i }
  ];

  for (const p of patterns) {
    if (p.regex.test(url)) {
      return { title: p.name, icon: p.icon, type: p.type };
    }
  }

  return { title: 'Unknown Link', icon: '🔗', type: 'link' };
};
