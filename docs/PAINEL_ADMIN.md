# Painel de administração (F1)

Painel dentro do jogo, visível só para contas listadas em `ADMIN_ACCOUNT_IDS`. Toda rota fica em `/api/admin/*`
e exige conta admin e um token de painel (código de 6 dígitos enviado ao e-mail da conta, válido por 10 minutos,
uso único, 5 tentativas, 3 pedidos por 10 minutos; o token do painel vale 12 horas e fica só em memória no cliente).

## Variáveis de ambiente (valores ficam fora do repositório)

- `RESEND_API_KEY`: chave da API do Resend para enviar o código do painel.
- `ADMIN_MAIL_FROM`: remetente dos e-mails do painel (endereço verificado no Resend).

Regras:
- Com as duas definidas, o código é enviado pelo Resend.
- Fora de produção e sem elas, o código vai para o log do servidor (desenvolvimento).
- **Em produção sem as duas, o painel fica indisponível**: ninguém entra.

## E-mail dos jogadores

O e-mail vem do provedor no login (Google e Discord pedem o escopo de e-mail). Convidados não têm e-mail.
Nas listas o e-mail aparece mascarado; "Revelar" mostra o completo e cada revelação vai para a auditoria.

## Auditoria

Tabela `painel_auditoria`: quem fez o quê, quando, sobre quem, e o estado antes e depois.
