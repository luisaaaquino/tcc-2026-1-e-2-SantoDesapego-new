---
id: pagamento-e-entrega
titulo: Pagamento, código de entrega e liberação do valor
versao: "2026.10"
vigente: true
fonte: regras RN04 e RN05 da Entrega Final do TCC e o fluxo implementado no site em 03/10/2026 (commit c325b5e, santo-desapego-api/routes/pagamentos.js)
mantido_por: equipe do TCC
muda: a cada mudança no fluxo de pagamento do site
---

# Pagamento, código de entrega e liberação do valor

## Como o comprador paga
O comprador paga pelo botão Comprar agora, e o pagamento é processado pelo
Mercado Pago. O produto só muda para Vendido depois que o Mercado Pago aprova
o pagamento. O vendedor precisa ter conectado a conta dele ao Mercado Pago
para receber; sem isso, a compra direto pelo site fica indisponível.

## Código de entrega
Quando o pagamento é aprovado, o vendedor recebe um código de entrega de 6
dígitos. Ele passa esse código ao comprador junto com o produto, no momento
da entrega. O comprador digita o código no site para confirmar que recebeu.

## Quando o vendedor recebe o dinheiro
O valor pago fica retido pela plataforma até a confirmação da entrega. Assim
que o comprador digita o código de entrega correto, o valor da venda, já com
o desconto da taxa de 5%, é liberado para o vendedor.

## Tentativas do código
O código de entrega aceita no máximo 5 tentativas erradas, para não ser
descoberto no chute. Depois da quinta tentativa errada, a confirmação fica
bloqueada e o caso segue para o suporte da plataforma.
