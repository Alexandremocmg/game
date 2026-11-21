# Hospedagem na VPS

**Verificado em 2026-11-21.** Além do GitHub Pages (veja [Deploy e Publicação](../README.md#deploy-e-publicação)), o jogo está publicado numa VPS da Hostinger, em **https://corrida.kabemmanager.online**. As duas publicações são **independentes**: o deploy automático do GitHub Pages **não** atualiza a VPS. Este documento descreve só o que é específico da Corrida Sem Fim. A infraestrutura compartilhada (usuário `jogos`, nginx, rotas do Traefik, firewall) e os passos para desfazer tudo estão no [runbook da VPS](https://github.com/Alexandremocmg/kabemjunto/blob/main/docs/OPERACAO-VPS.md#6-outros-jogos-hospedados-nesta-vps).

> Não registre neste repositório o IP da VPS, o link do terminal web da Hostinger, tokens ou senhas.

## Onde roda

| Item        | Valor                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Endereço    | `https://corrida.kabemmanager.online` (HTTPS pelo Traefik, certificado Let's Encrypt renovado sozinho)           |
| Código      | `/srv/jogos/corrida`, clone da branch `main` deste repositório, de propriedade do usuário `jogos`                |
| Servido por | nginx dos jogos (`jogos-static.service`), escutando só em `172.18.0.1:8081`, servindo a pasta **`dist/`**        |
| Build       | `npm ci` e `npm run build` na própria VPS, como `jogos` (3,5 MB em `dist/`)                                      |
| Rota        | `/etc/easypanel/traefik/config/jogos-corrida.yaml`                                                              |
| DNS         | registro `A` `corrida` em `kabemmanager.online`, no hPanel da Hostinger                                          |

O `vite.config.ts` usa `base: './'`, com caminhos relativos. Isso serve tanto para o subdiretório `/game/` do GitHub Pages quanto para a raiz do subdomínio da VPS, sem mudança.

## O que o servidor faz

- Serve arquivos estáticos. Só aceita `GET` e `HEAD`; os outros métodos recebem `403`.
- **`/assets/`** (arquivos com hash do Vite, incluindo `.js` e `.wasm`) sai com `Cache-Control: public, max-age=31536000, immutable`. **Todo o resto** (`index.html`, `models/*.glb`, páginas auxiliares) sai com `no-cache` e revalida por ETag, porque não tem hash no nome.
- `.glb` e `.wasm` são servidos com o tipo MIME correto. Há gzip e `X-Content-Type-Options: nosniff`. Caminhos com `/.` devolvem `404`.
- Não há backend: o saldo de moedas e o progresso ficam no navegador.

## Publicar uma nova versão

Nada atualiza sozinho. Como `root` no terminal da VPS:

```bash
J="runuser -u jogos -- env HOME=/srv/jogos"
$J git -C /srv/jogos/corrida pull --ff-only
cd /srv/jogos/corrida
$J npm_config_cache=/srv/jogos/.npm npm ci
$J npm_config_cache=/srv/jogos/.npm npm run build      # validate:assets + tsc --noEmit + vite build
```

**Atenção:** o Vite esvazia `dist/` no início do build, então o site fica fora do ar enquanto o build roda (em torno de um minuto) e, se o build falhar, fica sem arquivos até um novo build funcionar. Rode quando ninguém estiver jogando. Se o `pull` falhar com `--ff-only`, há divergência local na VPS; pare e investigue, não force.

## Conferir

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://corrida.kabemmanager.online/       # 200 text/html
curl -s -o /dev/null -w "%{http_code}\n" https://corrida.kabemmanager.online/.git/config              # 404
```

Em um navegador, abra o endereço: a avenida 3D e a tela "TOQUE PARA COMEÇAR" devem aparecer.

## Voltar atrás

```bash
J="runuser -u jogos -- env HOME=/srv/jogos"
$J git -C /srv/jogos/corrida log --oneline -5
$J git -C /srv/jogos/corrida checkout --detach <sha>
cd /srv/jogos/corrida && $J npm_config_cache=/srv/jogos/.npm npm ci && $J npm_config_cache=/srv/jogos/.npm npm run build
$J git -C /srv/jogos/corrida switch main                # depois, volta à main (e refaça o build)
```

Para tirar o jogo do ar: `rm /etc/easypanel/traefik/config/jogos-corrida.yaml` (o Traefik descarrega o arquivo sozinho). Para o desfazer completo, veja o [runbook](https://github.com/Alexandremocmg/kabemjunto/blob/main/docs/OPERACAO-VPS.md#6-outros-jogos-hospedados-nesta-vps).

## O que foi verificado

Em 2026-11-21, de fora da VPS, em Chromium: a página carregou com WebGL ativo, **0** erros de console, **0** requisições falhas e **0** respostas 4xx/5xx; o certificado é válido até 2027-02-19; `/.git/config` devolve 404; a porta 8081 pelo IP público não responde. O carregamento também contactou `www.gstatic.com`. **Não** foram testados celular físico, Safari, Firefox nem uma partida completa.
