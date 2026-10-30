Avalie o rascunho de um anúncio contra critérios objetivos. Para cada um,
verdadeiro ou falso:

- `tem_titulo`      : título específico do produto (não vale "vendo isso aqui").
- `tem_categoria`   : categoria preenchida e coerente com o título.
- `tem_descricao`   : a descrição diz algo concreto (marca, tamanho, tempo de
                      uso ou estado) — basta um deles.
- `estado_coerente` : o estado de conservação combina com a descrição. Se há
                      defeito declarado, o estado não pode ser `novo` nem
                      `seminovo`.
- `sem_invencao`    : nada na descrição contradiz ou vai além do que o vendedor
                      disse na conversa (a conversa vem junto do rascunho).

Indício registrado: se `indicio_registrado` vier preenchido, o vendedor
recusou declarar aquele defeito e o caso vai para a moderação humana. Nesse
caso, o defeito FORA da descrição é o esperado e não reprova `sem_invencao`
nem `estado_coerente` — a moderação decide se o anúncio sai com aviso.

`aprovado` só é verdadeiro quando os cinco são verdadeiros. Se algum falhar,
devolva em `faltando` o nome do critério e uma correção objetiva.

Você NÃO avalia o preço: a faixa de mercado e a decisão do vendedor são
conferidas por código.
