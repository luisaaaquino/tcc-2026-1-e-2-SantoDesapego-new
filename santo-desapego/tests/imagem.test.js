import { describe, test, expect, vi, beforeEach } from 'vitest';
import { redimensionarImagem } from '../src/utils/imagem';

// O jsdom não desenha imagens: simulamos a imagem (com largura e altura)
// e o canvas, e conferimos o tamanho que o código manda desenhar.
let tamanhoDaFoto;
let falharAoCarregar;
let canvas;

class ImagemFalsa {
  set src(_valor) {
    Object.assign(this, tamanhoDaFoto);
    setTimeout(() => (falharAoCarregar ? this.onerror(new Error('corrompida')) : this.onload()), 0);
  }
}

beforeEach(() => {
  falharAoCarregar = false;
  vi.stubGlobal('Image', ImagemFalsa);
  canvas = {
    width: 0, height: 0,
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    toDataURL: vi.fn(() => 'data:image/jpeg;base64,REDIMENSIONADA'),
  };
  const criarOriginal = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : criarOriginal(tag)));
});

const redimensionar = (largura, altura) => {
  tamanhoDaFoto = { width: largura, height: altura };
  return redimensionarImagem(new File(['x'], 'foto.png', { type: 'image/png' }));
};

describe('RNF19 - Limites de Upload', () => {
  test('foto deitada maior que 800 px fica com 800 de largura, sem distorcer', async () => {
    await redimensionar(1600, 1200);
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
  });

  test('foto em pé maior que 800 px fica com 800 de altura, sem distorcer', async () => {
    await redimensionar(1000, 2000);
    expect([canvas.width, canvas.height]).toEqual([400, 800]);
  });

  test('foto quadrada grande vira 800 x 800', async () => {
    await redimensionar(3000, 3000);
    expect([canvas.width, canvas.height]).toEqual([800, 800]);
  });

  test('foto pequena não é aumentada', async () => {
    await redimensionar(500, 300);
    expect([canvas.width, canvas.height]).toEqual([500, 300]);
  });

  test('toda foto sai em JPEG com qualidade 0,82 (vira texto base64 para envio)', async () => {
    const resultado = await redimensionar(1200, 900);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(resultado).toBe('data:image/jpeg;base64,REDIMENSIONADA');
  });

  test('arquivo de imagem corrompido gera erro em vez de travar', async () => {
    falharAoCarregar = true;
    await expect(redimensionar(100, 100)).rejects.toBeDefined();
  });
});
