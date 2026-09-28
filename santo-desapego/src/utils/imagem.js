/* ── Redimensiona uma imagem pra 800x800 max, JPEG q=0.82 (~150KB cada) ──
   Extraído de Anunciar.jsx pra ser reaproveitado também pelo chat do
   Agente de Anúncio (IA), sem duplicar o código de canvas resize. ── */
export const redimensionarImagem = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 800;
      let { width, height } = img;
      // Mantém proporção
      if (width > height) {
        if (width > MAX) { height = (height * MAX) / width; width = MAX; }
      } else {
        if (height > MAX) { width = (width * MAX) / height; height = MAX; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = e.target.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});
