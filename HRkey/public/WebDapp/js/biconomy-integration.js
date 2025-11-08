// js/biconomy-integration.js

const BiconomyService = {
    PAYMASTER_URL: "https://paymaster.biconomy.io/api/v2/84532/2eooW_HdO.4e0c67c1-ffe3-49e0-93c7-a9938b127898",
    BUNDLER_URL: "https://bundler.biconomy.io/api/v2/84532/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44",
    CONTRACT_ADDRESS: "0xFE79Ee969C7590467c89df9062846fb39Dbd5DCF", // Base Sepolia
    
    smartAccount: null,
    isInitialized: false,

    async initialize() {
        try {
            // Verificar que tengamos lo necesario
            if (!window.ethereum) {
                throw new Error("No wallet detected");
            }

            // Importar dinámicamente viem y biconomy
            const { createWalletClient, custom, encodeFunctionData, parseAbi } = await import('https://esm.sh/viem@2.7.0');
            const { baseSepolia } = await import('https://esm.sh/viem@2.7.0/chains');
            const { createSmartAccountClient, PaymasterMode } = await import('https://esm.sh/@biconomy/account@4.2.0');

            // Guardar referencias para uso posterior
            this.viem = { createWalletClient, custom, encodeFunctionData, parseAbi };
            this.chain = baseSepolia;
            this.BiconomyAccount = { createSmartAccountClient, PaymasterMode };
            
            // Crear wallet client
            const walletClient = createWalletClient({
                chain: baseSepolia,
                transport: custom(window.ethereum)
            });

            // Crear Smart Account
            this.smartAccount = await createSmartAccountClient({
                signer: walletClient,
                paymasterUrl: this.PAYMASTER_URL,
                bundlerUrl: this.BUNDLER_URL,
            });

            this.isInitialized = true;
            console.log('✅ Biconomy initialized successfully');
            return true;

        } catch (error) {
            console.error('❌ Error initializing Biconomy:', error);
            return false;
        }
    },

    async createReferenceGasless(refId, employee, reviewer, dataHash) {
        if (!this.isInitialized) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error("Failed to initialize Biconomy");
            }
        }

        try {
            console.log('📤 Sending gasless transaction...');

            const ABI = this.viem.parseAbi([
                'function createReference(bytes32 refId, address employee, address reviewer, bytes32 dataHash)'
            ]);

            const tx = {
                to: this.CONTRACT_ADDRESS,
                data: this.viem.encodeFunctionData({
                    abi: ABI,
                    functionName: 'createReference',
                    args: [refId, employee, reviewer, dataHash]
                })
            };

            const userOpResponse = await this.smartAccount.sendTransaction(tx, {
                paymasterServiceData: { 
                    mode: this.BiconomyAccount.PaymasterMode.SPONSORED 
                }
            });

            console.log('⏳ Waiting for confirmation...');
            const { transactionHash } = await userOpResponse.waitForTxHash();
            console.log('✅ Transaction hash:', transactionHash);

            const receipt = await userOpResponse.wait();
            console.log('✅ Transaction confirmed:', receipt);

            return {
                success: true,
                transactionHash,
                receipt
            };

        } catch (error) {
            console.error('❌ Error in gasless transaction:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Generar IDs únicos para referencias
    generateReferenceIds(employee, reviewer, referenceData) {
        const refIdInput = `${employee}${reviewer}${Date.now()}${Math.random()}`;
        const refId = ethers.utils.id(refIdInput); // Usar ethers para hash
        
        const dataString = JSON.stringify(referenceData);
        const dataHash = ethers.utils.id(dataString);
        
        return { refId, dataHash };
    }
};

// Exportar globalmente
window.BiconomyService = BiconomyService;