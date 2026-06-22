# Painel Loan

Dashboard em Next.js para comparar condicoes de borrow, LTV inicial, margem de chamada e liquidacao em AAVE, Morpho e CEXs.

## Escopo atual

- Borrow assets: `USDC`, `USDT`, `USDe`
- Colaterais: `BTC`, `ETH`, `SOL`, `HYPE`
- Plataformas: AAVE, Morpho, Binance, Gate, Bybit e Bitget

## Requisitos

- Node.js 20 LTS ou superior
- npm 10 ou superior
- Ambiente com filesystem persistente para a pasta `data/`

## Configuracao

1. Instalar dependencias:

```bash
npm ci
```

2. Criar o arquivo de ambiente:

```bash
cp .env.example .env.local
```

3. Preencher as variaveis em `.env.local`.

Use somente chaves read-only nas CEXs. Nao usar chaves com permissao de saque.

## Rodar em desenvolvimento

```bash
npm run dev
```

Abrir `http://localhost:3000`.

## Build e execucao em producao

```bash
npm ci
npm run build
npm run start
```

Por padrao o Next.js sobe em `http://localhost:3000`. Para alterar a porta:

```bash
npm run start -- -p 3001
```

Em producao, recomenda-se rodar atras de um proxy reverso como Nginx, Caddy, Apache ou balanceador da propria infraestrutura.

## Snapshot de dados

O painel grava snapshots em `data/latest.json` e arquivos historicos `data/snapshot-*.json`.

Atualizar manualmente:

```bash
npm run snapshot
```

Tambem existe atualizacao pelo botao "Atualizar agora" no painel, que chama `POST /api/snapshot`.

A agenda sugerida e 4x ao dia no horario de Sao Paulo:

- `00:00`
- `06:00`
- `12:00`
- `18:00`

### Windows Task Scheduler

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-snapshot-task.ps1
```

### Linux cron

Exemplo:

```cron
0 0,6,12,18 * * * cd /caminho/para/painel-loan && npm run snapshot >> logs/snapshot.log 2>&1
```

Crie a pasta `logs/` antes de usar esse exemplo ou ajuste o destino do log.

## Observacoes importantes para producao

- A pasta `data/` precisa persistir entre deploys/restarts se o historico for importante.
- Evitar deploy serverless puro sem adaptar o armazenamento, porque o projeto grava arquivos locais.
- Configurar as variaveis de ambiente no servidor, pipeline ou painel da hospedagem. Nao versionar `.env.local`.
- Se o painel ficar publico, considerar proteger `POST /api/snapshot` com autenticacao ou token interno.
- RPCs publicos funcionam para teste, mas RPC privado tende a ser mais confiavel.

## Arquivos que nao devem ir para producao

O pacote de entrega nao inclui:

- `node_modules/`
- `.next/`
- `.git/`
- `.env.local`
- `.npm-cache/`
- logs locais
- snapshots locais em `data/*.json`

