-- ============================================================
-- 007_codigo_entrega.sql
-- Token de confirmação de entrega (seção 2.3 / RN05 do TCC).
-- Quando o pagamento é aprovado, a compra ganha um código de 6
-- dígitos que só o comprador vê. No encontro, ele passa o código
-- ao vendedor, que digita na plataforma — isso registra a entrega
-- e libera a avaliação do vendedor.
--
-- Idempotente: pode rodar mais de uma vez.
--
-- Rodar uma vez no banco já existente:
--   psql -U postgres -d santo_desapego -f migrations/007_codigo_entrega.sql
-- ============================================================

ALTER TABLE compras ADD COLUMN IF NOT EXISTS codigo_entrega        VARCHAR(6);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS entrega_confirmada_em TIMESTAMP;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS tentativas_codigo     SMALLINT NOT NULL DEFAULT 0;

-- Compras antigas que já foram avaliadas: a entrega aconteceu,
-- então ficam registradas como confirmadas (data da avaliação).
UPDATE compras co
   SET entrega_confirmada_em = av.criada_em
  FROM avaliacoes av
 WHERE av.compra_id = co.id
   AND co.entrega_confirmada_em IS NULL;

-- Compras antigas ainda sem entrega confirmada ganham um código
-- (o comprador passa a vê-lo no Perfil).
UPDATE compras
   SET codigo_entrega = lpad(floor(random() * 1000000)::int::text, 6, '0')
 WHERE codigo_entrega IS NULL
   AND entrega_confirmada_em IS NULL;
