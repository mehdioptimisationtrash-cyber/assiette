// Lecture de codes-barres avec la caméra (ZXing, chargé seulement au premier scan — Safari
// iOS ne fournit pas l'API BarcodeDetector).

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js';

let zxingPromise = null;

function loadZxing() {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ZXING_URL;
      script.onload = () => resolve(window.ZXingBrowser);
      script.onerror = () => {
        zxingPromise = null;
        reject(new Error('Lecteur de code-barres indisponible (connexion ?)'));
      };
      document.head.append(script);
    });
  }
  return zxingPromise;
}

/**
 * Démarre la caméra arrière dans `video` et appelle `onCode(code)` au premier code lu.
 * Renvoie une fonction `stop()`.
 */
export async function startScan(video, onCode) {
  const ZXing = await loadZxing();
  const reader = new ZXing.BrowserMultiFormatReader();
  let done = false;
  const controls = await reader.decodeFromConstraints(
    { video: { facingMode: 'environment' } },
    video,
    (result) => {
      if (!result || done) return;
      done = true;
      controls.stop();
      navigator.vibrate?.(60);
      onCode(result.getText());
    },
  );
  return () => {
    done = true;
    controls.stop();
  };
}

export function explainCameraError(err) {
  if (err?.name === 'NotAllowedError') return "Accès à la caméra refusé : autorise-le dans Réglages → Safari → Appareil photo.";
  if (err?.name === 'NotFoundError') return 'Aucune caméra trouvée.';
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return 'La caméra demande une adresse https.';
  return err?.message ?? 'Caméra indisponible.';
}
