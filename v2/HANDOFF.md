# Nyl Hair Design — versão 2.0

Protótipo local clicável, baseado no repositório `lmarceloc/salaonyl`.

## Direção visual

- **Assunto / público:** salão de beleza em Ponta Grossa, para quem quer marcar um cuidado sem trocar várias mensagens.
- **Paleta:** papel quente, tinta café, coral queimado e amarelo-sol. A sensação é de agenda impressa / estúdio acolhedor, afastando o fluxo de uma landing page genérica.
- **Tipografia:** Playfair Display para o gesto humano/editorial; DM Sans para leitura; DM Mono para horários e metadados.
- **Layout:** hero curto + reserva guiada na mesma página. A lateral funciona como um recibo vivo do atendimento.
- **Assinatura:** selo circular “cuidado sem pressa” e trilho de progresso que transforma a reserva numa pequena sequência de ritual.

## Click path

1. Abrir a V2 e clicar em **Escolher meu horário**.
2. Selecionar um serviço.
3. Selecionar dia e horário.
4. Digitar nome/recado e clicar em **Preparar mensagem**.
5. Conferir a mensagem e abrir o WhatsApp.

## Estados considerados

| Grupo | Estado | Decisão |
|---|---|---|
| Dados | Serviço longo e descrições diferentes | Aplica: quatro cartões com nome, descrição e duração. |
| Dados | Um atendimento ainda vazio | Aplica: recibo lateral pede o primeiro serviço. |
| Dados | Muitos horários | Aplica: grade de cinco horários, com flexão no celular. |
| Sistema | Carregando / offline / falha parcial | Não se aplica ao protótipo estático; a confirmação real precisa tratar isso no backend. |
| Atividade | Reserva em andamento | Aplica: passos 1–3 com resumo vivo. |
| Atividade | Pedido concluído | Aplica: mensagem pronta e próximo passo explícito. |
| Pessoas | Dono/equipe do salão como destinatário | Aplica: bloco “Mensagem para a equipe Nyl”. |
| Interação | Selecionado, desabilitado, foco | Aplica: seleções visíveis, horários bloqueados até o dia, foco de teclado visível. |

## O que é protótipo

- Os horários, dias e duração são **amostras visuais**.
- O botão do WhatsApp monta a mensagem com os dados escolhidos, mas não confirma disponibilidade nem persiste reserva.
- Não construído: agenda real, bloqueio de conflito, confirmação automática, painel do dono e envio real ao WhatsApp.

## Autochecagem

- Conferir em 1424 px e 375 px: hierarquia, quebra de títulos, largura dos cartões, foco e ausência de rolagem horizontal.
- Não verificado: aparelho real, leitor de tela, contraste medido por ferramenta e navegadores além do Chromium embutido.
