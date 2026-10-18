        // Console Filter for Permissions-Policy, COOP, and AdBlocker WebChannel notifications
        (function() {
            const origWarn = console.warn;
            const origError = console.error;
            const filterKeywords = [
                'Permissions-Policy',
                'attribution-reporting',
                'private-aggregation',
                'join-ad-interest-group',
                'run-ad-auction',
                'Cross-Origin-Opener-Policy',
                'window.closed',
                'ERR_BLOCKED_BY_CLIENT',
                'webchannel_connection'
            ];
            function shouldFilter(args) {
                try {
                    for (let i = 0; i < args.length; i++) {
                        const item = args[i];
                        if (!item) continue;
                        const text = (typeof item === 'string')
                            ? item
                            : ((item.message || '') + ' ' + (item.stack || '') + ' ' + String(item));
                        for (let k = 0; k < filterKeywords.length; k++) {
                            if (text.includes(filterKeywords[k])) return true;
                        }
                    }
                } catch(e) {}
                return false;
            }
            console.warn = function(...args) {
                if (shouldFilter(args)) return;
                origWarn.apply(console, args);
            };
            console.error = function(...args) {
                if (shouldFilter(args)) return;
                origError.apply(console, args);
            };
        })();

        // Firebase Configuration (Placeholder - User needs to fill this)
        const firebaseConfig = {
            apiKey: "AIzaSyAk_IhHTEBGrqucA6bADbFDTbTd2sN2yvk",
            authDomain: "financial-control-467b0.firebaseapp.com",
            projectId: "financial-control-467b0",
            storageBucket: "financial-control-467b0.firebasestorage.app",
            messagingSenderId: "543373005822",
            appId: "1:543373005822:web:a3ea667011ea86657226af"
        };

        // Initialize Firebase
        try {
            console.log("Inicializando Firebase...");
            if (window.location.protocol === 'file:') {
                console.warn("AVISO: Usar o protocolo 'file://' pode impedir o funcionamento correto do login com Google (Pop-ups). Recomenda-se usar um servidor local (ex: Live Server).");
            }
            firebase.initializeApp(firebaseConfig);
            console.log("Firebase inicializado com sucesso.");
        } catch (e) {
            console.error("Erro ao inicializar Firebase:", e);
        }

        const auth = firebase.auth();
        const db = firebase.firestore();

        // Configurações do Firestore para evitar bloqueio por AdBlockers/Extensões (Long-Polling e Persistência Offline)
        try {
            db.settings({
                experimentalForceLongPolling: true,
                useFetchStreams: false,
                merge: true
            });
        } catch (settingsErr) {}

        try {
            db.enablePersistence({ synchronizeTabs: true }).catch(function() {});
        } catch (persistenceErr) {}

        const storage = firebase.storage();
        try {
            storage.setMaxUploadRetryTime(3000);
            storage.setMaxOperationRetryTime(3000);
        } catch (storageConfigErr) {
            console.warn("Aviso ao configurar retry time do Storage:", storageConfigErr);
        }
        const googleProvider = new firebase.auth.GoogleAuthProvider();
        googleProvider.setCustomParameters({ prompt: 'select_account' });

        // Handle redirect result
        auth.getRedirectResult().then((result) => {
            if (result && result.user) {
                console.log("Login via redirect bem-sucedido.");
            }
        }).catch((error) => {
            if (error && error.code) {
                console.error("Erro no resultado do redirect:", error.code);
            }
        });

        console.log("Auth e Firestore configurados.");

        let currentUser = null;
        let pendingSharedReceiptFile = null;
        let transactions = []; let goals = []; let editingTransactionId = null; let editingGoalId = null; let lastSearchResults = []; let financeChartInstance = null; let currentChartType = 'bar';
        let contasFixas = []; let cfBalance = 0; let cfBalanceSavedAt = null; let editingContaFixaId = null;
        let lastBackupDate = localStorage.getItem('lastBackupDate') || '';
        let currentLang = localStorage.getItem('lang') || 'pt-BR';
        let currentFontSize = localStorage.getItem('appFontSize') || 'normal';

        function getGreeting(lang) {
            const currentLanguage = lang || currentLang || localStorage.getItem('lang') || 'pt-BR';
            const hour = new Date().getHours();
            if (currentLanguage === 'es') {
                if (hour >= 5 && hour < 12) return 'Buenos días';
                if (hour >= 12 && hour < 18) return 'Buenas tardes';
                return 'Buenas noches';
            }
            if (currentLanguage === 'en') {
                if (hour >= 5 && hour < 12) return 'Good morning';
                if (hour >= 12 && hour < 18) return 'Good afternoon';
                return 'Good evening';
            }
            if (hour >= 5 && hour < 12) return 'Bom dia';
            if (hour >= 12 && hour < 18) return 'Boa tarde';
            return 'Boa noite';
        }

        function updateHeaderGreeting() {
            const titleEl = document.getElementById('headerGreetingTitle') || document.querySelector('.header-new-title');
            if (!titleEl) return;
            const greeting = getGreeting();
            let userName = '';
            if (currentUser && currentUser.displayName) {
                userName = currentUser.displayName.trim().split(' ')[0];
            } else if (currentUser && currentUser.email) {
                const namePart = currentUser.email.split('@')[0];
                userName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            }
            titleEl.textContent = userName ? `${greeting}, ${userName}` : greeting;
        }
        updateHeaderGreeting();

        // Auth State Listener
        auth.onAuthStateChanged((user) => {
            console.log("Estado de autenticação alterado:", user ? "Logado" : "Deslogado");
            const loginOverlay = document.getElementById('loginOverlay');
            const splashScreen = document.getElementById('splashScreen');

            if (user) {
                currentUser = user;
                console.log("Usuário autenticado com sucesso.");
                updateHeaderGreeting();

                const up = document.getElementById('userProfile');
                const ua = document.getElementById('userAvatar');
                const un = document.getElementById('userName');
                const ue = document.getElementById('userEmail');

                if (up && ua && un && ue) {
                    ua.src = user.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
                    un.textContent = user.displayName || 'Usuário';
                    ue.textContent = user.email || '';
                    up.style.display = 'flex';
                }

                if (loginOverlay) loginOverlay.style.display = 'none';

                // INICIA LISTENERS FIRESTORE
                setupFirestoreListeners(user);
                processPendingSharedReceipt();
            } else {
                currentUser = null;
                updateHeaderGreeting();
                // LIMPA DADOS E PARA LISTENERS
                if (unsubscribeTransactions) unsubscribeTransactions();
                if (unsubscribeGoals) unsubscribeGoals();

                transactions = [];
                goals = [];

                const up = document.getElementById('userProfile');
                if (up) up.style.display = 'none';

                if (splashScreen && splashScreen.classList.contains('hidden')) {
                    if (loginOverlay) loginOverlay.style.display = 'flex';
                }
                updateAllViews();
            }
        });

        function loginWithGoogle() {
            console.log("Tentativa de login iniciada...");
            const btn = document.getElementById('googleLoginBtn');
            const loader = document.getElementById('loginLoader');

            if (!auth || !googleProvider) {
                console.error("Firebase Auth não está configurado corretamente.");
                showNotification("Erro interno de configuração", "error");
                return;
            }

            btn.style.display = 'none';
            loader.style.display = 'block';

            // Primeiro tentamos o Popup
            auth.signInWithPopup(googleProvider).then((result) => {
                console.log("Login realizado com sucesso (Popup).");
                loader.style.display = 'none';
                btn.style.display = 'flex';
            }).catch((error) => {
                console.error("Erro detalhado no login (Popup):", error);

                // Se o popup falhar ou for bloqueado, tentamos o Redirect como fallback
                if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
                    console.log("Popup bloqueado ou falhou. Tentando Redirect...");
                    auth.signInWithRedirect(googleProvider);
                    return;
                }

                let errorMsg = "Erro ao entrar com Google";
                if (error.code === 'auth/unauthorized-domain') {
                    errorMsg = "Domínio não autorizado. Adicione 'localhost' no Firebase Console.";
                } else if (error.code === 'auth/popup-closed-by-user') {
                    errorMsg = "Janela de login fechada pelo usuário";
                }

                showNotification(errorMsg, "error");
                btn.style.display = 'flex';
                loader.style.display = 'none';
            });
        }

        function logout() {
            if (confirm("Deseja realmente sair?")) {
                auth.signOut().then(() => {
                    cleanupFirestoreListeners();
                    transactions = [];
                    goals = [];
                    contasFixas = [];
                    updateAllViews();
                    showNotification("Você saiu da conta", "info");
                });
            }
        }

        // ==================== FIRESTORE REAL-TIME PERSISTENCE ====================
        let unsubscribeTransactions = null;
        let unsubscribeGoals = null;
        let unsubscribeContasFixas = null;

        // Cleanup function to prevent memory leaks
        function cleanupFirestoreListeners() {
            if (typeof unsubscribeTransactions === 'function') {
                try { unsubscribeTransactions(); } catch(e) { console.error('Error unsubscribing transactions:', e); }
                unsubscribeTransactions = null;
            }
            if (typeof unsubscribeGoals === 'function') {
                try { unsubscribeGoals(); } catch(e) { console.error('Error unsubscribing goals:', e); }
                unsubscribeGoals = null;
            }
            if (typeof unsubscribeContasFixas === 'function') {
                try { unsubscribeContasFixas(); } catch(e) { console.error('Error unsubscribing contas fixas:', e); }
                unsubscribeContasFixas = null;
            }
        }

        function setupFirestoreListeners(user) {
            if (!user) return;
            // Transações
            unsubscribeTransactions = db.collection('transactions')
                .where('userId', '==', user.uid)
                .onSnapshot(snapshot => {
                    transactions = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    updateAllViews();
                    performSearch(); // Atualiza busca se estiver ativa
                }, error => {
                    if (error && String(error).includes('ERR_BLOCKED_BY_CLIENT')) return;
                    console.warn("Aviso no listener de transações:", error && error.message ? error.message : error);
                });

            // Metas
            unsubscribeGoals = db.collection('goals')
                .where('userId', '==', user.uid)
                .onSnapshot(snapshot => {
                    goals = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    updateGoalsList();
                }, error => {
                    if (error && String(error).includes('ERR_BLOCKED_BY_CLIENT')) return;
                    console.warn("Aviso no listener de metas:", error && error.message ? error.message : error);
                });
        }

        // Garantir que apenas dados do usuário atual estejam nos arrays
        function ensureUserDataIsolation() {
            if (!currentUser) {
                transactions = [];
                goals = [];
                return;
            }

            // Filtrar forçadamente qualquer transação que não seja do usuário atual
            transactions = transactions.filter(t => t.userId === currentUser.uid);
            goals = goals.filter(g => g.userId === currentUser.uid);
        }

        // Atualizar todas as views e garantir isolamento
        function updateAllViews() {
            try { ensureUserDataIsolation(); } catch (e) { console.error('Error in ensureUserDataIsolation:', e); }
            try { if (typeof updateTransactionsList === 'function') updateTransactionsList(); } catch (e) { console.error('Error in updateTransactionsList:', e); }
            try { if (typeof updateGoalsList === 'function') updateGoalsList(); } catch (e) { console.error('Error in updateGoalsList:', e); }
            try { if (typeof updateDailyTransactions === 'function') updateDailyTransactions(); } catch (e) { console.error('Error in updateDailyTransactions:', e); }
            try { if (typeof updateDailySummary === 'function') updateDailySummary(); } catch (e) { console.error('Error in updateDailySummary:', e); }
            try { if (typeof updateWeeklySummary === 'function') updateWeeklySummary(); } catch (e) { console.error('Error in updateWeeklySummary:', e); }
            try { if (typeof updateMonthlySummary === 'function') updateMonthlySummary(); } catch (e) { console.error('Error in updateMonthlySummary:', e); }
            try { if (typeof updateYearlySummary === 'function') updateYearlySummary(); } catch (e) { console.error('Error in updateYearlySummary:', e); }
            try { if (typeof updateTrashList === 'function') updateTrashList(); } catch (e) { console.error('Error in updateTrashList:', e); }
            try { if (typeof updateHeaderBalance === 'function') updateHeaderBalance(); } catch (e) { console.error('Error in updateHeaderBalance:', e); }
            try { if (typeof cfUpdateViews === 'function') cfUpdateViews(); } catch (e) { console.error('Error in cfUpdateViews:', e); }
            try {
                if (document.getElementById('search') && document.getElementById('search').classList.contains('active')) {
                    if (typeof populateYearSelect === 'function') populateYearSelect();
                }
            } catch (e) { console.error('Error in populateYearSelect (search):', e); }
        }
        window.updateAllViews = updateAllViews;
        var trashStorageKey = 'financialTrash_v2';
        function getTrashFromStorage() { try { var r = localStorage.getItem(trashStorageKey); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
        function saveTrashToStorage(a) { try { localStorage.setItem(trashStorageKey, JSON.stringify(a)); } catch (e) { } }
        function getActiveTransactions() { return transactions.filter(function (t) { return !t.deleted; }); }
        function getTrashTransactions() { var fs = getTrashFromStorage(); var fm = transactions.filter(function (t) { return t.deleted === true || t.deleted === 'true' || t.deleted === 1; }); var seen = {}; var out = []; fs.forEach(function (t) { var k = String(t.id); if (!seen[k]) { seen[k] = true; out.push(t); } }); fm.forEach(function (t) { var k = String(t.id); if (!seen[k]) { seen[k] = true; out.push(t); } }); return out; }

                const categories = { 'alimentacao': '\u{1F37D}\uFE0F Alimenta\u00E7\u00E3o', 'mercado': '\u{1F6D2} Mercado', 'combustivel': '\u26FD Combust\u00EDvel', 'manutencao_veiculo': '\u{1F527} Manuten\u00E7\u00E3o Ve\u00EDculo', 'transporte': '\u{1F697} Transporte', 'moradia': '\u{1F3E0} Moradia', 'saude': '\u{1F3E5} Sa\u00FAde', 'educacao': '\u{1F4DA} Educa\u00E7\u00E3o', 'lazer': '\u{1F3AE} Lazer', 'salario': '\u{1F4BC} Sal\u00E1rio', 'freelance': '\u{1F4BB} Freelance', 'investimentos': '\u{1F4C8} Investimentos', 'outros': '\u{1F4E6} Outros' };
        const categoryOrder = ['alimentacao', 'mercado', 'combustivel', 'manutencao_veiculo', 'transporte', 'moradia', 'saude', 'educacao', 'lazer', 'salario', 'freelance', 'investimentos', 'outros'];
        const categoriesEn = { 'alimentacao': '\u{1F37D}\uFE0F Food & Dining', 'mercado': '\u{1F6D2} Groceries', 'combustivel': '\u26FD Fuel', 'manutencao_veiculo': '\u{1F527} Vehicle Maintenance', 'transporte': '\u{1F697} Transportation', 'moradia': '\u{1F3E0} Housing', 'saude': '\u{1F3E5} Healthcare', 'educacao': '\u{1F4DA} Education', 'lazer': '\u{1F3AE} Leisure & Entertainment', 'salario': '\u{1F4BC} Salary', 'freelance': '\u{1F4BB} Freelance', 'investimentos': '\u{1F4C8} Investments', 'outros': '\u{1F4E6} Other' };
        const categoriesEs = { 'alimentacao': '\u{1F37D}\uFE0F Alimentaci\u00F3n', 'mercado': '\u{1F6D2} Supermercado', 'combustivel': '\u26FD Combustible', 'manutencao_veiculo': '\u{1F527} Mantenimiento de Veh\u00EDculo', 'transporte': '\u{1F697} Transporte', 'moradia': '\u{1F3E0} Vivienda', 'saude': '\u{1F3E5} Salud', 'educacao': '\u{1F4DA} Educaci\u00F3n', 'lazer': '\u{1F3AE} Ocio y Entretenimiento', 'salario': '\u{1F4BC} Salario', 'freelance': '\u{1F4BB} Freelance', 'investimentos': '\u{1F4C8} Inversiones', 'outros': '\u{1F4E6} Otros' };

        function getCategoryLabel(cat) {
            const lang = currentLang || localStorage.getItem('lang') || 'pt-BR';
            if (lang === 'es') return categoriesEs[cat] || categories[cat] || cat;
            if (lang === 'en') return categoriesEn[cat] || categories[cat] || cat;
            return categories[cat] || cat;
        }

        const i18n = {
            'pt-BR': {
                logout: 'Sair', pageTitle: 'Controle Financeiro Aprimorado', appTitle: 'Finan\u00E7as', saveTransaction: 'Salvar Transa\u00E7\u00E3o', placeholderDescShort: 'Descrição da sua transação', menuNewTransaction: 'Nova Transa\u00E7\u00E3o', menuTransactions: 'Transa\u00E7\u00F5es', menuSearch: 'Buscar', menuCharts: 'Gr\u00E1fico', menuSummaries: 'Resumos', menuGoals: 'Metas', menuTrash: 'Lixeira', menuBackup: 'Backup', menuFixedAccounts: 'Contas Fixas', menuAbout: 'Sobre', menuContact: 'Contato', menu: 'Menu', allTransactions: 'Todas as Transa\u00E7\u00F5es', searchTransactions: 'Buscar Transa\u00E7\u00F5es', searchByName: 'Buscar por nome/descri\u00E7\u00E3o', category: 'Categoria', type: 'Tipo', monthYear: 'M\u00EAs/Ano', allCategories: 'Todas as categorias', allTypes: 'Todos os tipos', income: 'Receita', expense: 'Despesa', favorites: 'Favoritas', favoritesOnly: 'Apenas favoritas', search: 'Buscar', clearFilters: 'Limpar Filtros', exportResults: 'Exportar Resultados', searchResults: 'Resultados da Busca', transactionsFound: 'transa\u00E7\u00F5es encontradas', searchIncome: 'Receitas na Busca', searchExpense: 'Despesas na Busca', searchBalance: 'Saldo da Busca', noTransactionsFound: 'Nenhuma transa\u00E7\u00E3o encontrada com os filtros aplicados', newTransaction: 'Nova Transa\u00E7\u00E3o', date: 'Data', value: 'Valor (R$)', description: 'Descri\u00E7\u00E3o', selectCategory: 'Selecione uma categoria', placeholderDesc: 'Descreva a transa\u00E7\u00E3o...', favoriteTransaction: 'Favoritar esta transa\u00E7\u00E3o', clear: 'Limpar', clearAll: 'Limpar Tudo', gains: 'Ganhos', spending: 'Gastos', balance: 'Saldo', dailyTransactions: 'Transa\u00E7\u00F5es do Dia Selecionado', chartsTitle: 'Gr\u00E1ficos de Receitas e Despesas', period: 'Per\u00EDodo', month: 'M\u00EAs', week: 'Semana', year: 'Ano', monthSpecific: 'M\u00EAs espec\u00EDfico', weekSpecific: 'Semana espec\u00EDfica', yearSpecific: 'Ano espec\u00EDfico', last3Months: '\u00DAltimos 3 meses', last6Months: '\u00DAltimos 6 meses', customPeriod: 'Personalizado', dateRange: 'Intervalo de Datas', startDate: 'Data Inicial', endDate: 'Data Final', today: 'Hoje', groupBy: 'Agrupar por', view: 'Visualizar', incomeExpense: 'Receitas e Despesas', expenseOnly: 'Apenas Despesas', incomeOnly: 'Apenas Receitas', chartType: 'Tipo de gr\u00E1fico', pie: 'Pizza', bar: 'Barras', line: 'Linhas', dailySummary: 'Resumo Di\u00E1rio', weeklySummary: 'Resumo Semanal', monthlySummary: 'Resumo Mensal', yearlySummary: 'Resumo Anual', selectDay: 'Selecionar Dia', selectWeek: 'Selecionar Semana', selectMonth: 'Selecionar M\u00EAs', selectYear: 'Selecionar Ano', allMonths: 'Todos os meses', financialGoals: 'Metas Financeiras', newGoal: 'Nova Meta', emptyTrash: 'Esvaziar lixeira', trashInfo: 'Transa\u00E7\u00F5es exclu\u00EDdas podem ser restauradas ou removidas permanentemente.', backupExport: 'Backup e Exporta\u00E7\u00E3o', exportJson: 'Exportar JSON', importJson: 'Importar JSON', exportExcel: 'Exportar Excel', manualSync: 'Sincronizar na nuvem',
                editTransaction: 'Editar Transa\u00E7\u00E3o', save: 'Salvar', cancel: 'Cancelar', addGoal: 'Nova Meta', goalDescription: 'Descri\u00E7\u00E3o da Meta', goalTarget: 'Valor da Meta (R$)', goalCurrent: 'Valor Atual (R$)', saveGoal: 'Salvar Meta', editGoal: 'Editar Meta', exportToExcel: 'Exportar para Excel', allRecords: 'Todos os registros', onlyIncome: 'Apenas ganhos', onlyExpense: 'Apenas gastos', calculator: 'Calculadora', edit: 'Editar', delete: 'Excluir', deletePermanent: 'Excluir permanentemente', moveToTrash: 'Mover esta transa\u00E7\u00E3o para a lixeira?', movedToTrash: 'Transa\u00E7\u00E3o movida para a lixeira.', deletePermanentConfirm: 'Excluir permanentemente? Esta a\u00E7\u00E3o n\u00E3o pode ser desfeita.', trashEmpty: 'A lixeira j\u00E1 est\u00E1 vazia.', emptyTrashConfirm: 'Excluir permanentemente as', trashEmptyConfirm: 'transa\u00E7\u00F5es) da lixeira? Esta a\u00E7\u00E3o n\u00E3o pode ser desfeita.', trashEmptied: 'Lixeira esvaziada.', noTrash: 'Nenhuma transa\u00E7\u00E3o na lixeira', fillGoalFields: 'Por favor, preencha os campos da meta!', currentNotGreater: 'O valor atual n\u00E3o pode ser maior que a meta!', goalAdded: 'Meta adicionada!', goalEdited: 'Meta editada!', deleteGoalConfirm: 'Tem certeza que deseja excluir esta meta?', goalDeleted: 'Meta exclu\u00EDda!', noGoals: 'Nenhuma meta cadastrada', restore: 'Restaurar', saveError: 'Erro ao salvar dados!', goalPlaceholder: 'Ex: Comprar um carro', noExport: 'Nenhuma transa\u00E7\u00E3o para exportar!', fillAllFields: 'Por favor, preencha todos os campos!', transactionAdded: 'Transa\u00E7\u00E3o adicionada com sucesso!', transactionEdited: 'Transa\u00E7\u00E3o editada!', transactionRestored: 'Transa\u00E7\u00E3o restaurada!', transactionDeletedPerm: 'Transa\u00E7\u00E3o exclu\u00EDda permanentemente.', noTransactionsPeriod: 'Nenhuma transa\u00E7\u00E3o para este per\u00EDodo', noTransactionsDay: 'Nenhuma transa\u00E7\u00E3o para este dia', noTransactionsFilters: 'Nenhuma transa\u00E7\u00E3o encontrada com os filtros!', exportSuccess: 'Exportado para Excel com sucesso!', exportError: 'Erro ao exportar para Excel!', importConfirm: 'Importar este arquivo ir\u00E1 substituir todos os dados atuais. Deseja continuar?', importSuccess: 'Dados importados com sucesso!', clearConfirm: '\u26A0\uFE0F ATEN\u00C7\u00C3O: Esta a\u00E7\u00E3o ir\u00E1 apagar TODOS os dados. Deseja continuar?', allDataCleared: 'Todos os dados foram apagados!', backupExported: 'Backup JSON exportado!', backupExportError: 'Erro ao exportar o backup!', loadError: 'Erro ao carregar dados!', fillGoalCorrect: 'Preencha os campos corretamente!', noTransactionsFoundShort: 'Nenhuma transa\u00E7\u00E3o encontrada', viewReceipt: 'Ver comprovante anexado', viewReceiptModalTitle: 'Comprovante Anexado', downloadReceipt: 'Baixar Comprovante', openInNewTab: 'Abrir em Nova Aba', close: 'Fechar', receiptDownloaded: 'Comprovante baixado com sucesso!', receiptLoading: 'Carregando comprovante...', fontSizeTitle: 'Tamanho do Texto', fontSmall: 'Pequeno', fontNormal: 'Padrão', fontMedium: 'Médio', fontLarge: 'Grande'
            }, 'en': {
                pageTitle: 'Financial Management - Pro', appTitle: 'Finances', saveTransaction: 'Save Transaction', placeholderDescShort: 'Transaction description', menuNewTransaction: 'New Transaction', menuTransactions: 'Transactions', menuSearch: 'Search', menuCharts: 'Charts', menuSummaries: 'Summaries', menuGoals: 'Goals', menuTrash: 'Trash', menuBackup: 'Backup', menuFixedAccounts: 'Fixed Expenses', menuAbout: 'About', menuContact: 'Contact', menu: 'Menu', allTransactions: 'All Transactions', searchTransactions: 'Search Transactions', searchByName: 'Search by description or name', category: 'Category', type: 'Type', monthYear: 'Month/Year', allCategories: 'All categories', allTypes: 'All types', income: 'Income', expense: 'Expense', favorites: 'Favorites', favoritesOnly: 'Favorites only', search: 'Search', clearFilters: 'Clear Filters', exportResults: 'Export Results', searchResults: 'Search Results', transactionsFound: 'transactions found', searchIncome: 'Search Income', searchExpense: 'Search Expenses', searchBalance: 'Search Balance', noTransactionsFound: 'No transactions found matching the applied filters', newTransaction: 'New Transaction', date: 'Date', value: 'Amount ($)', description: 'Description', selectCategory: 'Select a category', placeholderDesc: 'Enter transaction description...', favoriteTransaction: 'Add to favorites', clear: 'Clear', clearAll: 'Clear All', gains: 'Income', spending: 'Expenses', balance: 'Balance', dailyTransactions: 'Transactions for Selected Day', chartsTitle: 'Income & Expense Charts', period: 'Period', month: 'Month', week: 'Week', year: 'Year', monthSpecific: 'Specific month', weekSpecific: 'Specific week', yearSpecific: 'Specific year', last3Months: 'Last 3 months', last6Months: 'Last 6 months', customPeriod: 'Custom range', dateRange: 'Date Range', startDate: 'Start Date', endDate: 'End Date', today: 'Today', groupBy: 'Group by', view: 'View', incomeExpense: 'Income and Expenses', expenseOnly: 'Expenses only', incomeOnly: 'Income only', chartType: 'Chart type', logout: 'Log Out', pie: 'Pie', bar: 'Bar', line: 'Line', dailySummary: 'Daily Summary', weeklySummary: 'Weekly Summary', monthlySummary: 'Monthly Summary', yearlySummary: 'Yearly Summary', selectDay: 'Select Day', selectWeek: 'Select Week', selectMonth: 'Select Month', selectYear: 'Select Year', allMonths: 'All months', financialGoals: 'Financial Goals', newGoal: 'New Goal', emptyTrash: 'Empty Trash', trashInfo: 'Deleted transactions can be restored or permanently removed.', backupExport: 'Backup and Export', exportJson: 'Export JSON', importJson: 'Import JSON', exportExcel: 'Export to Excel', manualSync: 'Sync to Cloud',
                editTransaction: 'Edit Transaction', save: 'Save', cancel: 'Cancel', addGoal: 'New Goal', goalDescription: 'Goal Description', goalTarget: 'Target Amount ($)', goalCurrent: 'Current Amount ($)', saveGoal: 'Save Goal', editGoal: 'Edit Goal', exportToExcel: 'Export to Excel', allRecords: 'All records', onlyIncome: 'Income only', onlyExpense: 'Expenses only', calculator: 'Calculator', edit: 'Edit', delete: 'Delete', deletePermanent: 'Delete permanently', moveToTrash: 'Move this transaction to trash?', movedToTrash: 'Transaction moved to trash.', deletePermanentConfirm: 'Delete permanently? This action cannot be undone.', trashEmpty: 'Trash is already empty.', emptyTrashConfirm: 'Permanently delete the', trashEmptyConfirm: 'transaction(s) from trash? This action cannot be undone.', trashEmptied: 'Trash emptied.', noTrash: 'No transactions in trash', fillGoalFields: 'Please fill in all goal fields.', currentNotGreater: 'Current amount cannot exceed the target amount.', goalAdded: 'Goal created successfully!', goalEdited: 'Goal updated successfully!', deleteGoalConfirm: 'Are you sure you want to delete this goal?', goalDeleted: 'Goal deleted.', noGoals: 'No goals found', restore: 'Restore', saveError: 'Error saving data.', goalPlaceholder: 'e.g. Buy a car', noExport: 'No transactions to export.', fillAllFields: 'Please fill in all fields.', transactionAdded: 'Transaction added successfully!', transactionEdited: 'Transaction updated successfully!', transactionRestored: 'Transaction restored successfully.', transactionDeletedPerm: 'Transaction permanently deleted.', noTransactionsPeriod: 'No transactions found for this period', noTransactionsDay: 'No transactions found for this day', noTransactionsFilters: 'No transactions found matching the filters.', exportSuccess: 'Exported to Excel successfully!', exportError: 'Error exporting to Excel.', importConfirm: 'Importing this file will replace all current data. Do you want to continue?', importSuccess: 'Data imported successfully!', clearConfirm: '\u26A0\uFE0F WARNING: This action will permanently erase ALL data. Do you want to continue?', allDataCleared: 'All data has been cleared.', backupExported: 'JSON backup exported successfully!', backupExportError: 'Error exporting backup.', loadError: 'Error loading data.', fillGoalCorrect: 'Please fill in the fields correctly.', noTransactionsFoundShort: 'No transactions found', viewReceipt: 'View attached receipt', viewReceiptModalTitle: 'Attached Receipt', downloadReceipt: 'Download Receipt', openInNewTab: 'Open in New Tab', close: 'Close', receiptDownloaded: 'Receipt downloaded successfully!', receiptLoading: 'Loading receipt...', fontSizeTitle: 'Text Size', fontSmall: 'Small', fontNormal: 'Default', fontMedium: 'Medium', fontLarge: 'Large'
            }, 'es': {
                logout: 'Cerrar sesi\u00F3n', pageTitle: 'Control Financiero Avanzado', appTitle: 'Finanzas', saveTransaction: 'Guardar Transacci\u00F3n', placeholderDescShort: 'Descripci\u00F3n de la transacci\u00F3n', menuNewTransaction: 'Nueva Transacci\u00F3n', menuTransactions: 'Transacciones', menuSearch: 'Buscar', menuCharts: 'Gr\u00E1ficos', menuSummaries: 'Res\u00FAmenes', menuGoals: 'Metas', menuTrash: 'Papelera', menuBackup: 'Copia de Seguridad', menuFixedAccounts: 'Cuentas Fijas', menuAbout: 'Acerca de', menuContact: 'Contacto', menu: 'Men\u00FA', allTransactions: 'Todas las Transacciones', searchTransactions: 'Buscar Transacciones', searchByName: 'Buscar por nombre o descripci\u00F3n', category: 'Categor\u00EDa', type: 'Tipo', monthYear: 'Mes/A\u00F1o', allCategories: 'Todas las categor\u00EDas', allTypes: 'Todos los tipos', income: 'Ingreso', expense: 'Gasto', favorites: 'Favoritas', favoritesOnly: 'Solo favoritas', search: 'Buscar', clearFilters: 'Limpiar Filtros', exportResults: 'Exportar Resultados', searchResults: 'Resultados de la B\u00FAsqueda', transactionsFound: 'transacciones encontradas', searchIncome: 'Ingresos en B\u00FAsqueda', searchExpense: 'Gastos en B\u00FAsqueda', searchBalance: 'Saldo de B\u00FAsqueda', noTransactionsFound: 'Ninguna transacci\u00F3n encontrada con los filtros aplicados', newTransaction: 'Nueva Transacci\u00F3n', date: 'Fecha', value: 'Importe (R$)', description: 'Descripci\u00F3n', selectCategory: 'Selecciona una categor\u00EDa', placeholderDesc: 'Describe la transacci\u00F3n...', favoriteTransaction: 'A\u00F1adir a favoritas', clear: 'Limpiar', clearAll: 'Limpiar Todo', gains: 'Ingresos', spending: 'Gastos', balance: 'Saldo', dailyTransactions: 'Transacciones del D\u00EDa Seleccionado', chartsTitle: 'Gr\u00E1ficos de Ingresos y Gastos', period: 'Per\u00EDodo', month: 'Mes', week: 'Semana', year: 'A\u00F1o', monthSpecific: 'Mes espec\u00EDfico', weekSpecific: 'Semana espec\u00EDfica', yearSpecific: 'A\u00F1o espec\u00EDfico', last3Months: '\u00DAltimos 3 meses', last6Months: '\u00DAltimos 6 meses', customPeriod: 'Per\u00EDodo personalizado', dateRange: 'Rango de Fechas', startDate: 'Fecha Inicial', endDate: 'Fecha Final', today: 'Hoy', groupBy: 'Agrupar por', view: 'Visualizar', incomeExpense: 'Ingresos y Gastos', expenseOnly: 'Solo Gastos', incomeOnly: 'Solo Ingresos', chartType: 'Tipo de gr\u00E1fico', pie: 'Circular', bar: 'Barras', line: 'L\u00EDneas', dailySummary: 'Resumen Diario', weeklySummary: 'Resumen Semanal', monthlySummary: 'Resumen Mensual', yearlySummary: 'Resumen Anual', selectDay: 'Seleccionar D\u00EDa', selectWeek: 'Seleccionar Semana', selectMonth: 'Seleccionar Mes', selectYear: 'Seleccionar A\u00F1o', allMonths: 'Todos os meses', financialGoals: 'Metas Financieras', newGoal: 'Nueva Meta', emptyTrash: 'Vaciar papelera', trashInfo: 'Las transacciones eliminadas pueden restaurarse o eliminarse permanentemente.', backupExport: 'Copia de Seguridad y Exportaci\u00F3n', exportJson: 'Exportar JSON', importJson: 'Importar JSON', exportExcel: 'Exportar a Excel', manualSync: 'Sincronizar en la nube',
                editTransaction: 'Editar Transacci\u00F3n', save: 'Guardar', cancel: 'Cancelar', addGoal: 'Nueva Meta', goalDescription: 'Descripci\u00F3n de la Meta', goalTarget: 'Importe de la Meta (R$)', goalCurrent: 'Importe Actual (R$)', saveGoal: 'Guardar Meta', editGoal: 'Editar Meta', exportToExcel: 'Exportar a Excel', allRecords: 'Todos los registros', onlyIncome: 'Solo ingresos', onlyExpense: 'Solo gastos', calculator: 'Calculadora', edit: 'Editar', delete: 'Eliminar', deletePermanent: 'Eliminar permanentemente', moveToTrash: '\u00BFMover esta transacci\u00F3n a la papelera?', movedToTrash: 'Transacci\u00F3n movida a la papelera.', deletePermanentConfirm: '\u00BFEliminar permanentemente? Esta acci\u00F3n no se puede deshacer.', trashEmpty: 'La papelera ya est\u00E1 vac\u00EDa.', emptyTrashConfirm: '\u00BFEliminar permanentemente las', trashEmptyConfirm: 'transacciones de la papelera? Esta acci\u00F3n no se puede deshacer.', trashEmptied: 'Papelera vaciada.', noTrash: 'Ninguna transacci\u00F3n en la papelera', fillGoalFields: '\u00A1Por favor, completa los campos de la meta!', currentNotGreater: '\u00A1El importe actual no puede superar la meta!', goalAdded: '\u00A1Meta creada con \u00E9xito!', goalEdited: '\u00A1Meta actualizada con \u00E9xito!', deleteGoalConfirm: '\u00BFEst\u00E1s seguro de que deseas eliminar esta meta?', goalDeleted: '\u00A1Meta eliminada!', noGoals: 'Ninguna meta registrada', restore: 'Restaurar', saveError: '\u00A1Error al guardar datos!', goalPlaceholder: 'Ej: Comprar un coche', noExport: '\u00A1Ninguna transacci\u00F3n para exportar!', fillAllFields: '\u00A1Por favor, completa todos los campos!', transactionAdded: '\u00A1Transacci\u00F3n a\u00F1adida con \u00E9xito!', transactionEdited: '\u00A1Transacci\u00F3n actualizada con \u00E9xito!', transactionRestored: '\u00A1Transacci\u00F3n restaurada!', transactionDeletedPerm: 'Transacci\u00F3n eliminada permanentemente.', noTransactionsPeriod: 'Ninguna transacci\u00F3n para este per\u00EDodo', noTransactionsDay: 'Ninguna transacci\u00F3n para este d\u00EDa', noTransactionsFilters: '\u00A1Ninguna transacci\u00F3n encontrada con los filtros!', exportSuccess: '\u00A1Exportado a Excel con \u00E9xito!', exportError: '\u00A1Error al exportar a Excel!', importConfirm: 'Importar este archivo reemplazar\u00E1 todos los datos actuales. \u00BFDeseas continuar?', importSuccess: '\u00A1Datos importados con \u00E9xito!', clearConfirm: '\u26A0\uFE0F ATENCI\u00D3N: Esta acci\u00F3n borrar\u00E1 TODOS los datos. \u00BFDeseas continuar?', allDataCleared: '\u00A1Todos los datos han sido borrados!', backupExported: '\u00A1Copia de seguridad JSON exportada!', backupExportError: '\u00A1Error al exportar la copia de seguridad!', loadError: '\u00A1Error al cargar datos!', fillGoalCorrect: '\u00A1Completa los campos correctamente!', noTransactionsFoundShort: 'Ninguna transacci\u00F3n encontrada', viewReceipt: 'Ver comprobante adjunto', viewReceiptModalTitle: 'Comprobante Adjunto', downloadReceipt: 'Descargar Comprobante', openInNewTab: 'Abrir en Nueva Pesta\u00F1a', close: 'Cerrar', receiptDownloaded: '\u00A1Comprobante descargado con \u00E9xito!', receiptLoading: 'Cargando comprobante...', fontSizeTitle: 'Tama\u00F1o del Texto', fontSmall: 'Peque\u00F1o', fontNormal: 'Normal', fontMedium: 'Medio', fontLarge: 'Grande'
            }
        };

        // currentLang is initialized at top of file

        function toggleLanguage() {
            try {
                if (currentLang === 'pt-BR') {
                    setLanguage('en');
                } else if (currentLang === 'en') {
                    setLanguage('es');
                } else {
                    setLanguage('pt-BR');
                }
            } catch (err) {
                console.error("Erro ao alternar idioma:", err);
            }
        }

        function setLanguage(lang) {
            try {
                currentLang = lang;
                try {
                    localStorage.setItem('lang', lang);
                } catch (e) {}

                // Update Single Button Icon: Show CURRENT language flag
                const btn = document.getElementById('langToggleBtn');
                if (btn) {
                    if (lang === 'pt-BR') {
                        btn.innerHTML = '<img src="https://flagcdn.com/w40/br.png" alt="Bandeira do Brasil" style="width: 24px; height: 18px; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">';
                        btn.title = "Idioma: Português";
                    } else if (lang === 'es') {
                        btn.innerHTML = '<img src="https://flagcdn.com/w40/es.png" alt="Bandera de España" style="width: 24px; height: 18px; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">';
                        btn.title = "Idioma: Español";
                    } else {
                        btn.innerHTML = '<img src="https://flagcdn.com/w40/us.png" alt="USA Flag" style="width: 24px; height: 18px; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">';
                        btn.title = "Language: English";
                    }
                }

                applyTranslations(lang);
                if (typeof updateClock === 'function') updateClock();
            } catch (err) {
                console.error("Erro no setLanguage:", err);
            }
        }
        function t(key) { const lang = currentLang || localStorage.getItem('lang') || 'pt-BR'; return (i18n[lang] && i18n[lang][key]) ? i18n[lang][key] : key; }

        function applyTranslations(lang) {
            try {
                document.querySelectorAll('[data-i18n]').forEach(el => {
                    const key = el.getAttribute('data-i18n');
                    if (key === 'appTitle') return;
                    if (i18n[lang] && i18n[lang][key] !== undefined) {
                        el.textContent = i18n[lang][key];
                    }
                });
            } catch (e) { console.error('Error applying data-i18n:', e); }

            try {
                document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                    const key = el.getAttribute('data-i18n-placeholder');
                    if (i18n[lang] && i18n[lang][key] !== undefined) {
                        el.placeholder = i18n[lang][key];
                    }
                });
            } catch (e) { console.error('Error applying data-i18n-placeholder:', e); }

            try {
                document.querySelectorAll('[data-i18n-title]').forEach(el => {
                    const key = el.getAttribute('data-i18n-title');
                    if (i18n[lang] && i18n[lang][key] !== undefined) {
                        el.title = i18n[lang][key];
                    }
                });
            } catch (e) { console.error('Error applying data-i18n-title:', e); }

            try {
                document.querySelectorAll('option[data-i18n]').forEach(el => {
                    const key = el.getAttribute('data-i18n');
                    if (i18n[lang] && i18n[lang][key] !== undefined) {
                        el.textContent = i18n[lang][key];
                    }
                });
            } catch (e) { console.error('Error applying option data-i18n:', e); }

            try {
                document.querySelectorAll('select#searchCategory option[value],select#transactionCategory option[value],select#editTransactionCategory option[value],select#exportCategory option[value]').forEach(opt => {
                    if (opt.value && categoryOrder.includes(opt.value)) {
                        opt.textContent = getCategoryLabel(opt.value);
                    }
                });
            } catch (e) { console.error('Error translating category options:', e); }

            try {
                document.title = (i18n[lang] && i18n[lang].pageTitle) ? i18n[lang].pageTitle : 'Controle Financeiro';
            } catch (e) {}

            try { if (typeof populateYearSelect === 'function') populateYearSelect(); } catch (e) { console.error('populateYearSelect error:', e); }
            try { if (typeof updateMonthPickerButtonText === 'function') updateMonthPickerButtonText(); } catch (e) { console.error('updateMonthPickerButtonText error:', e); }
            try { if (typeof updateAllViews === 'function') updateAllViews(); } catch (e) { console.error('updateAllViews error:', e); }
            try { if (typeof updateTrashList === 'function') updateTrashList(); } catch (e) { console.error('updateTrashList error:', e); }
            try { if (typeof performSearch === 'function') performSearch(); } catch (e) { console.error('performSearch error:', e); }
            try { if (typeof updateHeaderGreeting === 'function') updateHeaderGreeting(); } catch (e) { console.error('updateHeaderGreeting error:', e); }
            try { if (typeof updateDatePillText === 'function') updateDatePillText(); } catch (e) { console.error('updateDatePillText error:', e); }
        }

        // Font Size Management
        function setFontSize(size) {
            const validSizes = ['small', 'normal', 'medium', 'large'];
            if (!validSizes.includes(size)) size = 'normal';
            currentFontSize = size;
            try {
                localStorage.setItem('appFontSize', size);
            } catch (e) {}

            document.documentElement.setAttribute('data-font-size', size);

            document.querySelectorAll('.font-size-btn, .menu-font-btn').forEach(btn => {
                if (btn.getAttribute('data-size') === size) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            setTimeout(function() {
                if (typeof closeFontSizeMenu === 'function') closeFontSizeMenu();
            }, 180);
        }

        function toggleFontSizeMenu(event) {
            if (event) {
                event.stopPropagation();
            }
            const popover = document.getElementById('fontSizePopover');
            if (popover) {
                popover.classList.toggle('active');
            }
        }

        function closeFontSizeMenu() {
            const popover = document.getElementById('fontSizePopover');
            if (popover && popover.classList.contains('active')) {
                popover.classList.remove('active');
            }
        }

        document.addEventListener('click', function(e) {
            const popover = document.getElementById('fontSizePopover');
            const toggleBtn = document.getElementById('fontSizeToggleBtn');
            if (popover && popover.classList.contains('active')) {
                if (!popover.contains(e.target) && !toggleBtn?.contains(e.target)) {
                    popover.classList.remove('active');
                }
            }
        });

        let clockIntervalId = null;
        function startClock() { updateClock(); if (clockIntervalId) clearInterval(clockIntervalId); clockIntervalId = setInterval(updateClock, 1000); }
        document.addEventListener('DOMContentLoaded', function () {
            applyTheme();
            var savedFontSize = localStorage.getItem('appFontSize') || 'normal';
            setFontSize(savedFontSize);
            var savedLang = localStorage.getItem('lang') || 'pt-BR';
            setLanguage(savedLang);
            startClock();
            setTimeout(function () {
                var s = document.getElementById('splashScreen');
                if (s) {
                    s.classList.add('hidden');
                    // After splash, if no user, show login overlay
                    if (!currentUser) {
                        document.getElementById('loginOverlay').style.display = 'flex';
                    }
                }
                updateClock();
            }, 1500);
            setCurrentDates();
            if (typeof updateDateDisplayText === 'function') updateDateDisplayText();
            try { if (typeof populateYearSelect === 'function') populateYearSelect(); } catch(e) {}
            try { if (typeof initializeMonthPicker === 'function') initializeMonthPicker(); } catch(e) {}
            try { if (typeof updateAllViews === 'function') updateAllViews(); } catch(e) {}
            try { if (typeof updateTrashList === 'function') updateTrashList(); } catch(e) {}
            try { if (typeof performSearch === 'function') performSearch(); } catch(e) {}
        });
        window.addEventListener('load', updateClock);
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { updateClock(); startClock(); } });

        function toggleTheme() {
            if (document.body.classList.contains('dark')) {
                setThemeLight();
            } else {
                setThemeDark();
            }
        }

        function setThemeDark() {
            document.body.classList.remove('light');
            document.body.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            updateThemeButtons();
            const chart = Chart.getChart("financeChart");
            if (chart) updateChart();
        }

        function setThemeLight() {
            document.body.classList.remove('dark');
            document.body.classList.add('light');
            localStorage.setItem('theme', 'light');
            updateThemeButtons();
            const chart = Chart.getChart("financeChart");
            if (chart) updateChart();
        }

        function updateThemeButtons() {
            const btn = document.getElementById('themeToggleBtn');
            if (!btn) return;

            if (document.body.classList.contains('dark')) {
                // Dark Mode: Show Moon Icon (indicating current state is dark) OR Sun icon to switch?
                // Request: "moon icon when dark mode active"
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>';
                btn.title = "Alternar para Modo Claro";
            } else {
                // Light Mode: Show Sun Icon
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>';
                btn.title = "Alternar para Modo Escuro";
            }
        }
        function updateClock() {
            updateHeaderGreeting();
            var te = document.getElementById('clockTime');
            var de = document.getElementById('clockDate');
            if (!te || !de) return;
            var n = new Date();
            // REMOVIDO: checkScheduledBackup(); - função não existe mais
            var lang = (typeof currentLang !== 'undefined' ? currentLang : null) || localStorage.getItem('lang') || 'pt-BR';
            var h = n.getHours();
            var m = n.getMinutes();
            var s = n.getSeconds();
            var d = n.getDate();
            var mo = n.getMonth();
            var y = n.getFullYear();
            var mS = m < 10 ? '0' + m : '' + m;
            var sS = s < 10 ? '0' + s : '' + s;
            var hS = h < 10 ? '0' + h : '' + h;
            var monthNamesPt = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            var monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            var monthNamesEs = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            if (lang === 'en') {
                var ap = h >= 12 ? 'PM' : 'AM';
                var h12 = h % 12 || 12;
                te.textContent = h12 + ':' + mS + ' ' + ap;
                de.textContent = monthNamesEn[mo] + ' ' + d + ', ' + y;
            } else if (lang === 'es') {
                te.textContent = hS + ':' + mS;
                de.textContent = d + ' de ' + monthNamesEs[mo] + ', ' + y;
            } else {
                te.textContent = hS + ':' + mS;
                de.textContent = d + ' de ' + monthNamesPt[mo] + ', ' + y;
            }
        }
        function applyTheme() {
            const st = localStorage.getItem('theme') || 'dark';
            const b = document.body;
            if (st === 'light') {
                b.classList.remove('dark');
                b.classList.add('light');
            } else {
                b.classList.remove('light');
                b.classList.add('dark');
            }
            updateThemeButtons();
        }

        function toggleMenu() { document.getElementById('menuOverlay').classList.add('active'); document.getElementById('sideMenu').classList.add('active'); }
        function closeMenu() { document.getElementById('menuOverlay').classList.remove('active'); document.getElementById('sideMenu').classList.remove('active'); }

        function showTab(tabName, el) { document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active')); document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active')); document.getElementById(tabName).classList.add('active'); if (el) el.classList.add('active'); closeMenu(); if (tabName === 'new-transaction') updateDailyTransactions(); else if (tabName === 'search') { populateYearSelect(); updateMonthPickerButtonText(); updateCategorySummaryLabels(); performSearch(); } else if (tabName === 'trash') { updateTrashList(); setTimeout(updateTrashList, 50); } else if (tabName === 'charts') { toggleChartPeriodInputs(); updateCategorySummaryLabels(); } }

        let selectedSearchCategories = new Set();
        let selectedChartCategories = new Set();
        let categoryModalTarget = null;
        function openCategorySelectionModal(target) {
            categoryModalTarget = target;
            const list = document.getElementById('categorySelectionList');
            if (!list) return;
            list.innerHTML = '';
            const selected = target === 'search' ? selectedSearchCategories : selectedChartCategories;
            categoryOrder.forEach(cat => {
                const checked = selected.has(cat) ? 'checked' : '';
                const label = getCategoryLabel(cat);
                const card = document.createElement('label');
                card.className = 'category-selection-card' + (selected.has(cat) ? ' selected' : '');
                card.innerHTML = `<input type="checkbox" value="${cat}" ${checked} onchange="toggleModalCategory(this)"> <span>${label}</span>`;
                list.appendChild(card);
            });
            const title = document.getElementById('categorySelectionModalTitle');
            const subtitle = document.getElementById('categorySelectionModalSubtitle');
            if (title) title.textContent = target === 'search' ? 'Selecionar categorias de busca' : 'Selecionar categorias do gráfico';
            if (subtitle) subtitle.textContent = target === 'search' ? 'Escolha as categorias que entrarão nos resultados da busca.' : 'Defina quais categorias serão exibidas no gráfico.';
            showModal('categorySelectionModal');
        }
        function toggleModalCategory(input) { const card = input.closest('.category-selection-card'); if (!card) return; card.classList.toggle('selected', input.checked); }
        function applyCategorySelection() {
            if (!categoryModalTarget) return;
            const selected = categoryModalTarget === 'search' ? selectedSearchCategories : selectedChartCategories;
            selected.clear();
            document.querySelectorAll('#categorySelectionList input[type="checkbox"]:checked').forEach(cb => selected.add(cb.value));
            if (categoryModalTarget === 'search') {
                updateSearchCategoryUI();
                performSearch();
            } else {
                updateCategorySummaryLabels();
                updateChart();
            }
            closeModal('categorySelectionModal');
            categoryModalTarget = null;
        }
        function clearCategorySelection() { document.querySelectorAll('#categorySelectionList input[type="checkbox"]').forEach(cb => { cb.checked = false; cb.closest('.category-selection-card').classList.remove('selected'); }); }
        function updateCategorySummaryLabels() {
            const chartSummary = document.getElementById('chartCategorySummary');
            if (chartSummary) {
                if (selectedChartCategories.size === 0) {
                    chartSummary.textContent = 'Todas';
                } else if (selectedChartCategories.size === 1) {
                    chartSummary.textContent = getCategoryLabel(Array.from(selectedChartCategories)[0]);
                } else {
                    chartSummary.textContent = `${selectedChartCategories.size} categorias selecionadas`;
                }
            }
            const searchSummary = document.getElementById('searchCategorySummary');
            if (searchSummary) {
                if (selectedSearchCategories.size === 0) {
                    searchSummary.textContent = 'Nenhuma selecionada';
                } else if (selectedSearchCategories.size === 1) {
                    searchSummary.textContent = getCategoryLabel(Array.from(selectedSearchCategories)[0]);
                } else {
                    searchSummary.textContent = `${selectedSearchCategories.size} categorias selecionadas`;
                }
            }
        }
        function toggleSearchCategory(btn) { const cat = btn.getAttribute('data-cat'); if (selectedSearchCategories.has(cat)) { selectedSearchCategories.delete(cat); btn.classList.remove('selected'); } else { selectedSearchCategories.add(cat); btn.classList.add('selected'); } updateSearchCategoryUI(); performSearch(); }
        function clearSearchCategories() { selectedSearchCategories.clear(); updateSearchCategoryUI(); performSearch(); }
        function getSearchTypeLabel() { const sT = document.getElementById('searchType').value; if (!sT) return document.querySelector('[data-i18n="allTypes"]') ? 'Todos os tipos' : 'Todos'; return sT === 'income' ? 'Receita' : 'Despesa'; }
        function getSearchPeriodLabel() { const year = document.getElementById('searchYear') ? document.getElementById('searchYear').value : ''; const months = Array.from(selectedMonths).map(k => k.split('-')[1]); if (!year && months.length === 0) return 'Todos'; if (months.length === 0) return year || 'Todos'; return months.map(m => `${m}/${year || ''}`).join(', '); }
        function getSearchRangeLabel() { const sSD = document.getElementById('searchStartDate') ? document.getElementById('searchStartDate').value : ''; const sED = document.getElementById('searchEndDate') ? document.getElementById('searchEndDate').value : ''; if (!sSD && !sED) return 'Sem limite'; if (sSD && sED) return `${formatDateForDisplay(sSD)} até ${formatDateForDisplay(sED)}`; if (sSD) return `A partir de ${formatDateForDisplay(sSD)}`; return `Até ${formatDateForDisplay(sED)}`; }
        function updateSearchFilterSummary() { const categoriesSummary = document.getElementById('searchSummaryCategories'); const typeSummary = document.getElementById('searchSummaryType'); const periodSummary = document.getElementById('searchSummaryPeriod'); const rangeSummary = document.getElementById('searchSummaryRange'); const favoriteSummary = document.getElementById('searchSummaryFavorite'); if (categoriesSummary) categoriesSummary.textContent = document.getElementById('searchCategorySummary') ? document.getElementById('searchCategorySummary').textContent : 'Nenhuma selecionada'; if (typeSummary) typeSummary.textContent = getSearchTypeLabel(); if (periodSummary) periodSummary.textContent = getSearchPeriodLabel(); if (rangeSummary) rangeSummary.textContent = getSearchRangeLabel(); if (favoriteSummary) favoriteSummary.textContent = document.getElementById('searchFavorites').checked ? 'Apenas favoritas' : 'Todas'; }
        function updateSearchCategoryUI() { const countEl = document.getElementById('searchCategoryCount'); const clearBtn = document.getElementById('searchCategoryClearBtn'); const summaryEl = document.getElementById('searchCategorySummary'); const n = selectedSearchCategories.size; if (countEl) { countEl.textContent = n; if (n > 0) { countEl.classList.remove('hidden'); } else { countEl.classList.add('hidden'); } } if (clearBtn) { clearBtn.style.display = n > 0 ? 'inline-block' : 'none'; } if (summaryEl) { if (n === 0) { summaryEl.textContent = 'Nenhuma selecionada'; } else if (n === 1) { const cat = Array.from(selectedSearchCategories)[0]; summaryEl.textContent = getCategoryLabel(cat); } else { summaryEl.textContent = `${n} categorias selecionadas`; } } updateCategorySummaryLabels(); updateSearchFilterSummary(); }
        function performSearch() { const sD = document.getElementById('searchDescription').value.toLowerCase(); const sCats = selectedSearchCategories; const sT = document.getElementById('searchType').value; const sY = document.getElementById('searchYear') ? document.getElementById('searchYear').value : ''; const sF = document.getElementById('searchFavorites').checked; const sMA = Array.from(selectedMonths).map(k => k.split('-')[1]); const sSD = document.getElementById('searchStartDate') ? document.getElementById('searchStartDate').value : ''; const sED = document.getElementById('searchEndDate') ? document.getElementById('searchEndDate').value : ''; let f = getActiveTransactions().filter(tx => { if (sD && !tx.description.toLowerCase().includes(sD)) return false; if (sCats.size > 0 && !sCats.has(tx.category)) return false; if (sT && tx.type !== sT) return false; if (sSD && tx.date < sSD) return false; if (sED && tx.date > sED) return false; if (sMA.length > 0 || sY) { const tY = tx.date.substring(0, 4); const tM = tx.date.substring(5, 7); if (sY && tY !== sY) return false; if (sMA.length > 0 && !sMA.includes(tM)) return false; } if (sF && !tx.favorite) return false; return true; }); f.sort((a, b) => new Date(b.date) - new Date(a.date)); lastSearchResults = f; updateSearchResults(f); updateSearchFilterSummary(); }

        function updateSearchResults(f) { const l = document.getElementById('searchResultsList'); const c = document.getElementById('searchResultCount'); const tc = document.getElementById('searchTotalsCard'); c.textContent = `${f.length} ${t('transactionsFound')}`; if (f.length === 0) { l.innerHTML = '<div class="empty-state">' + t('noTransactionsFound') + '</div>'; tc.style.display = 'none'; return; } const inc = f.filter(x => x.type === 'income').reduce((s, x) => s + x.value, 0); const exp = f.filter(x => x.type === 'expense').reduce((s, x) => s + x.value, 0); const bal = inc - exp; document.getElementById('searchTotalIncome').textContent = formatCurrency(inc); document.getElementById('searchTotalExpense').textContent = formatCurrency(exp); document.getElementById('searchTotalBalance').textContent = formatCurrency(bal); tc.style.display = 'block'; const bd = {}; f.forEach(x => { if (!bd[x.date]) bd[x.date] = []; bd[x.date].push(x); }); const ds = Object.keys(bd).sort((a, b) => b.localeCompare(a)); l.innerHTML = '<div class="search-results-grouped">' + ds.map(d => `<div class="search-results-date-group"><div class="search-results-date-header">${formatDateForDisplay(d)}</div><div class="search-results-date-list">${bd[d].map(x => renderSearchResultCard(x)).join('')}</div></div>`).join('') + '</div>'; }

        function renderSearchResultCard(tx) {
            const fc = tx.favorite ? ' favorite-star favorited' : ' favorite-star';
            const fi = tx.favorite ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
            return `<div class="search-result-card">
                <button class="${fc}" onclick="toggleFavorite('${tx.id}');performSearch();" title="${tx.favorite ? 'Desfavoritar' : 'Favoritar'}">${fi}</button>
                <div class="transaction-info">
                    <div class="transaction-description">${escapeHtml(tx.description)}</div>
                    <div class="transaction-meta">${getCategoryLabel(tx.category)} \u2022 ${tx.type === 'income' ? t('income') : t('expense')}${tx.time ? ` \u2022 ${formatTimeForDisplay(tx.time)}` : ''}</div>
                </div>
                <div class="transaction-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.value)}</div>
                <div class="transaction-actions">
                    <button class="action-btn edit" onclick="editTransaction('${tx.id}')" title="${t('edit')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="action-btn delete" onclick="deleteTransaction('${tx.id}')" title="${t('delete')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg></button>
                </div>
            </div>`;
        }

        function toggleFavorite(id) {
            const x = transactions.find(t => t.id === id);
            if (x) {
                db.collection('transactions').doc(id).update({
                    favorite: !x.favorite
                }).catch(err => console.error("Erro ao favoritar:", err));
            }
        }
        function clearSearch() { document.getElementById('searchDescription').value = ''; clearSearchCategories(); document.getElementById('searchType').value = ''; clearMonthSelection(); document.getElementById('searchYear').value = ''; document.getElementById('searchFavorites').checked = false; if (document.getElementById('searchStartDate')) document.getElementById('searchStartDate').value = ''; if (document.getElementById('searchEndDate')) document.getElementById('searchEndDate').value = ''; clearQuickDateBtns(); performSearch(); }
        function setQuickDateRange(range) { const today = getTodayInBrasiliaISO(); const startEl = document.getElementById('searchStartDate'); const endEl = document.getElementById('searchEndDate'); if (!startEl || !endEl) return; clearQuickDateBtns(); if (range === 'clear') { startEl.value = ''; endEl.value = ''; performSearch(); return; } const todayDate = new Date(today + 'T12:00:00'); let startDate, endDate; switch(range) { case 'today': startDate = today; endDate = today; break; case 'yesterday': { const yd = new Date(todayDate); yd.setDate(yd.getDate() - 1); startDate = yd.toISOString().split('T')[0]; endDate = startDate; break; } case '7days': { const sd = new Date(todayDate); sd.setDate(sd.getDate() - 6); startDate = sd.toISOString().split('T')[0]; endDate = today; break; } case '15days': { const sd = new Date(todayDate); sd.setDate(sd.getDate() - 14); startDate = sd.toISOString().split('T')[0]; endDate = today; break; } case '30days': { const sd = new Date(todayDate); sd.setDate(sd.getDate() - 29); startDate = sd.toISOString().split('T')[0]; endDate = today; break; } case 'thisMonth': { startDate = today.substring(0, 7) + '-01'; endDate = today; break; } case 'lastMonth': { const lm = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1); const lmEnd = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0); startDate = lm.toISOString().split('T')[0]; endDate = lmEnd.toISOString().split('T')[0]; break; } } startEl.value = startDate; endEl.value = endDate; const btnId = { 'today': 'qdrToday', 'yesterday': 'qdrYesterday', '7days': 'qdr7', '15days': 'qdr15', '30days': 'qdr30', 'thisMonth': 'qdrThisMonth', 'lastMonth': 'qdrLastMonth' }; const activeBtn = document.getElementById(btnId[range]); if (activeBtn) activeBtn.classList.add('active'); performSearch(); }
        function clearQuickDateBtns() { document.querySelectorAll('.date-range-quick-btn').forEach(b => b.classList.remove('active')); }
        function exportSearchResultsToExcel() { if (lastSearchResults.length === 0) { showNotification(t('noExport'), 'warning'); return; } exportToExcel(lastSearchResults, `busca-financeira-${getTodayInBrasiliaISO()}`); }

        function getTodayInBrasiliaISO() { const n = new Date(); const b = new Date(n.getTime() - 3 * 60 * 60 * 1000); return b.toISOString().split('T')[0]; }
        function getWeekRangeFromDate(inputDate) { const d = new Date(inputDate + 'T00:00:00Z'); const dow = d.getUTCDay(); const dowISO = dow === 0 ? 7 : dow; const s = new Date(d); s.setUTCDate(d.getUTCDate() - dowISO + 1); const e = new Date(s); e.setUTCDate(s.getUTCDate() + 6); return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] }; }

        let monthPickerCurrentYear = new Date().getFullYear(); let selectedMonths = new Set();
        function initializeMonthPicker() { monthPickerCurrentYear = new Date().getFullYear(); selectedMonths.clear(); updateMonthPickerButtonText(); }
        function getMonthNames() { const m = { 'pt-BR': ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'], 'en': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'es': ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] }; return m[currentLang || 'pt-BR'] || m['pt-BR']; }
        function renderMonthPicker() { const g = document.getElementById('monthPickerGrid'); const go = document.getElementById('monthPickerGridOtherYear'); const ye = document.getElementById('monthPickerYear'); if (!g || !go || !ye) return; ye.textContent = monthPickerCurrentYear; const mn = getMonthNames(); const oy = monthPickerCurrentYear + 1; g.innerHTML = ''; go.innerHTML = ''; mn.forEach((name, i) => { const mN = String(i + 1).padStart(2, '0'); const mK = `${monthPickerCurrentYear}-${mN}`; const iS = selectedMonths.has(mK); const btn = document.createElement('button'); btn.type = 'button'; btn.className = `month-picker-item ${iS ? 'selected' : ''}`; btn.textContent = name; btn.onclick = () => toggleMonthSelection(monthPickerCurrentYear, mN); g.appendChild(btn); }); mn.slice(0, 4).forEach((name, i) => { const mN = String(i + 1).padStart(2, '0'); const mK = `${oy}-${mN}`; const iS = selectedMonths.has(mK); const btn = document.createElement('button'); btn.type = 'button'; btn.className = `month-picker-item other-year ${iS ? 'selected' : ''}`; btn.textContent = name; btn.onclick = () => toggleMonthSelection(oy, mN); go.appendChild(btn); }); updateSelectedMonthsInput(); updateMonthPickerButtonText(); }
        function toggleMonthSelection(y, mN) { const mK = `${y}-${mN}`; if (selectedMonths.has(mK)) selectedMonths.delete(mK); else selectedMonths.add(mK); renderMonthPicker(); updateMonthPickerButtonText(); performSearch(); }
        function changeMonthPickerYear(d) { monthPickerCurrentYear += d; renderMonthPicker(); }
        function updateSelectedMonthsInput() { const inp = document.getElementById('selectedMonths'); if (inp) { const mv = Array.from(selectedMonths).map(k => k.split('-')[1]); inp.value = JSON.stringify(mv); } updateMonthPickerButtonText(); }
        function clearMonthSelection() { selectedMonths.clear(); renderMonthPicker(); updateMonthPickerButtonText(); }
        function updateMonthPickerButtonText() { const btn = document.getElementById('monthPickerButtonText'); if (!btn) return; if (selectedMonths.size === 0) { btn.textContent = currentLang === 'es' ? 'Seleccionar Mes' : (currentLang === 'en' ? 'Select Month' : 'Selecionar M\u00EAs'); } else { const mn = getMonthNames(); const sv = Array.from(selectedMonths).map(k => { const p = k.split('-'); return mn[parseInt(p[1]) - 1]; }); const suffix = currentLang === 'es' ? 'meses seleccionados' : (currentLang === 'en' ? 'months selected' : 'meses selecionados'); if (sv.length <= 3) btn.textContent = sv.join(', '); else btn.textContent = `${sv.length} ${suffix}`; } }
        function showMonthPickerModal() { renderMonthPicker(); showModal('monthPickerModal'); }
        function closeMonthPickerModal() { closeModal('monthPickerModal'); }

        function populateYearSelect() { const ys = document.getElementById('searchYear'); if (!ys) return; const years = new Set(); transactions.forEach(t => { if (t.date && t.date.length >= 4) years.add(t.date.substring(0, 4)); }); const cy = new Date().getFullYear(); for (let y = 2020; y <= cy + 1; y++)years.add(String(y)); const sy = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)); const cv = ys.value; const allYearsLabel = currentLang === 'es' ? 'Todos los a\u00F1os' : (currentLang === 'en' ? 'All years' : 'Todos os anos'); ys.innerHTML = '<option value="">' + allYearsLabel + '</option>'; sy.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; ys.appendChild(o); }); if (cv && ys.querySelector(`option[value="${cv}"]`)) ys.value = cv; }

        function setCurrentDates() {
            const ti = getTodayInBrasiliaISO();
            const td = new Date(ti + 'T00:00:00Z');
            const y = td.getUTCFullYear();
            const m = String(td.getUTCMonth() + 1).padStart(2, '0');
            document.getElementById('transactionDate').value = ti;

            document.getElementById('dailySummaryDate').value = ti;
            document.getElementById('monthlySummaryDate').value = `${y}-${m}`;
            document.getElementById('yearlySummaryDate').value = y;
            const wi = document.getElementById('weeklySummaryDate');
            const d = new Date(ti);
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
            const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const wn = Math.ceil((((d - ys) / 86400000) + 1) / 7);
            wi.value = `${y}-W${String(wn).padStart(2, '0')}`;
        }

        function escapeHtml(text) {
            if (!text) return '';
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return String(text).replace(/[&<>"']/g, m => map[m]);
        }

        function addTransaction(type) {
            if (!currentUser) {
                showNotification("Faça login para salvar", "error");
                return;
            }
            const d = document.getElementById('transactionDate').value;
            const v = parseFloat(document.getElementById('transactionValue').value);
            const c = document.getElementById('transactionCategory').value;
            const desc = document.getElementById('transactionDescription').value.trim();
            const f = document.getElementById('transactionFavorite').checked;

            // Validate - enhanced validation
            if (!d || !v || !c || !desc) {
                showNotification(t('fillAllFields'), 'error');
                return;
            }
            
            if (v <= 0 || !isFinite(v)) {
                showNotification('Valor deve ser maior que zero', 'error');
                return;
            }
            
            if (desc.length < 2 || desc.length > 100) {
                showNotification('Descrição deve ter entre 2 e 100 caracteres', 'error');
                return;
            }
            
            // Validate date is not in future unreasonably
            const selectedDate = new Date(d + 'T00:00:00Z');
            const today = new Date();
            if (selectedDate > today) {
                // Allow current day but warn about future dates
                if (selectedDate > new Date(today.getTime() + 86400000 * 7)) {
                    if (!confirm('Você está registrando uma transação muito no futuro. Continuar?')) return;
                }
            }

            // Auto-generate time
            const now = new Date();
            const h = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            const currentTime = `${h}:${min}`;

            // Add directly to Firestore
            db.collection('transactions').add({
                userId: currentUser.uid,
                type: type,
                date: d,
                time: currentTime, // Auto-generated
                value: parseFloat(v.toFixed(2)), // Ensure proper decimal
                category: String(c).substring(0, 50), // Limit category length
                description: escapeHtml(String(desc)).substring(0, 100), // Escape and limit
                favorite: !!f,
                createdAt: new Date().toISOString(),
                deleted: false
            }).then(() => {
                showNotification(t('transactionAdded'), 'success');
                if (type === 'income' && typeof triggerWealthBurst === 'function') {
                    triggerWealthBurst();
                }
                clearTransactionForm();
            }).catch(error => {
                console.error("Erro ao adicionar transação: ", error);
                showNotification("Erro ao salvar no servidor: " + (error.message || "desconhecido"), "error");
            });
        }
        function clearTransactionForm() {
            document.getElementById('transactionValue').value = '';
            document.getElementById('transactionCategory').value = '';
            document.getElementById('transactionDescription').value = '';
            document.getElementById('transactionDate').value = getTodayInBrasiliaISO();

            document.getElementById('transactionFavorite').checked = false;
            setTransactionType('income');
            if (typeof updateDateDisplayText === 'function') updateDateDisplayText();
        }
        function editTransaction(id) {
            const tx = transactions.find(t => t.id === id);
            if (!tx) return;
            editingTransactionId = id;
            document.getElementById('editTransactionDate').value = tx.date;
            const typeSelect = document.getElementById('editTransactionType');
            if (typeSelect) typeSelect.value = tx.type;
            document.getElementById('editTransactionValue').value = tx.value;
            document.getElementById('editTransactionCategory').value = tx.category;
            document.getElementById('editTransactionDescription').value = tx.description;
            document.getElementById('editTransactionFavorite').checked = !!tx.favorite;
            showModal('editTransactionModal');
        }
        function saveTransactionEdit() {
            const d = document.getElementById('editTransactionDate').value;
            const typeSelect = document.getElementById('editTransactionType');
            const type = typeSelect ? typeSelect.value : 'expense'; // Default fallback
            const v = parseFloat(document.getElementById('editTransactionValue').value);
            const c = document.getElementById('editTransactionCategory').value;
            const desc = document.getElementById('editTransactionDescription').value.trim();
            const f = document.getElementById('editTransactionFavorite').checked;

            if (!d || !v || v <= 0 || !c || !desc) {
                showNotification(t('fillAllFields'), 'error');
                return;
            }

            // Note: We don't update 'time' here to preserve the original creation time
            db.collection('transactions').doc(editingTransactionId).update({
                type: type,
                date: d,
                value: v,
                category: c,
                description: desc,
                favorite: !!f,
                userId: currentUser.uid // Ensure userId is preserved/set
            }).then(() => {
                showNotification(t('transactionEdited'), 'success');
                closeModal('editTransactionModal');
            }).catch(error => {
                console.error("Erro ao editar: ", error);
                showNotification("Erro ao atualizar transação", "error");
            });
        }
        function deleteTransaction(id) {
            if (confirm(t('moveToTrash'))) {
                // Instead of moving to a separate array, we mark as deleted in Firestore
                // This assumes we filter out deleted=true in queries or views
                db.collection('transactions').doc(id).update({
                    deleted: true,
                    deletedAt: new Date().toISOString()
                }).then(() => {
                    showNotification(t('movedToTrash'), 'success');
                }).catch(error => {
                    console.error("Erro ao mover para lixeira: ", error);
                    showNotification("Erro ao excluir", "error");
                });
            }
        }
        function restoreTransaction(id) {
            if (!id) return;
            // Ensure ID is a string for Firestore
            const docId = String(id);
            console.log("Tentando restaurar transação:", docId);

            db.collection('transactions').doc(docId).update({
                deleted: false,
                deletedAt: null
            }).then(() => {
                showNotification(t('transactionRestored'), 'success');
                // Force update if listener doesn't catch it immediately (though it should)
            }).catch(error => {
                console.error("Erro ao restaurar transação:", error);
                showNotification("Erro ao restaurar item", "error");
            });
        }
        function deletePermanently(id) {
            if (confirm(t('deletePermanentConfirm'))) {
                db.collection('transactions').doc(id).delete()
                    .then(() => {
                        showNotification(t('transactionDeletedPerm'), 'warning');
                    }).catch(error => {
                        console.error("Erro ao excluir permanentemente: ", error);
                    });
            }
        }
        // emptyTrash logic might need update if we want to batch delete. For now, simple client implementation over Firestore data
        function emptyTrash() {
            const trashItems = getTrashTransactions();
            if (trashItems.length === 0) {
                showNotification(t('trashEmpty'), 'info');
                return;
            }
            if (confirm(t('emptyTrashConfirm') + ' ' + trashItems.length + ' ' + t('trashEmptyConfirm'))) {
                const batch = db.batch();
                trashItems.forEach(tx => {
                    const ref = db.collection('transactions').doc(tx.id);
                    batch.delete(ref);
                });
                batch.commit().then(() => {
                    showNotification(t('trashEmptied'), 'warning');
                }).catch(error => {
                    console.error("Erro ao esvaziar lixeira: ", error);
                    showNotification("Erro ao esvaziar lixeira", "error");
                });
            }
        }
        function updateTrashList() {
            var l = document.getElementById('trashList');
            var eb = document.getElementById('emptyTrashBtn');
            if (!l) return;
            var tr = getTrashTransactions();
            var s = tr.slice().sort(function (a, b) { return new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0); });
            if (eb) eb.style.display = s.length > 0 ? '' : 'none';
            if (s.length === 0) {
                l.innerHTML = '<div class="empty-state">' + t('noTrash') + '</div>';
                return;
            }
            l.innerHTML = s.map(function (tx) {
                var dd = tx.deletedAt ? formatDateForDisplay(String(tx.deletedAt).split('T')[0]) : '';
                var isCF = !!tx.isCF;
                var categoryLabel = isCF ? (tx.category || '📦') + ' Conta Fixa' : getCategoryLabel(tx.category);

                // Buttons differ for CF items vs regular transactions
                var restoreBtn, deleteBtn;
                if (isCF) {
                    // Pass the full item data as JSON so we can recreate in Firestore
                    var encoded = encodeURIComponent(JSON.stringify(tx));
                    restoreBtn = '<button type="button" class="action-btn edit" onclick="restoreContaFixaFromTrash(\'' + tx.id + '\',' + JSON.stringify(tx).replace(/'/g, "&#39;").replace(/"/g, '&quot;') + ')" title="' + t('restore') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg></button>';
                    deleteBtn = '<button type="button" class="action-btn delete" onclick="deleteContaFixaPermanentlyFromTrash(\'' + tx.id + '\')" title="' + t('deletePermanent') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
                } else {
                    restoreBtn = '<button type="button" class="action-btn edit" onclick="restoreTransaction(\'' + tx.id + '\')" title="' + t('restore') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg></button>';
                    deleteBtn = '<button type="button" class="action-btn delete" onclick="deletePermanently(\'' + tx.id + '\')" title="' + t('deletePermanent') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
                }

                return '<div class="transaction-item">' +
                    '<div class="transaction-info">' +
                    '<div class="transaction-description">' + escapeHtml(tx.description || '') + '</div>' +
                    '<div class="transaction-meta">' + categoryLabel + ' \u2022 ' + formatDateForDisplay(tx.date) + (dd ? ' \u2022 ' + (currentLang === 'es' ? 'Eliminada el ' : (currentLang === 'en' ? 'Deleted on ' : 'Exclu\u00EDda em ')) + dd : '') + '</div>' +
                    '</div>' +
                    '<div class="transaction-amount ' + (tx.type || 'expense') + '">' + (tx.type === 'income' ? '+' : '-') + formatCurrency(tx.value) + '</div>' +
                    '<div class="transaction-actions">' + restoreBtn + deleteBtn + '</div></div>';
            }).join('');
        }

        // Restore a deleted conta fixa — re-creates in Firestore, removes from localStorage trash
        function restoreContaFixaFromTrash(trashId, txData) {
            if (!currentUser) { showNotification('Faça login para restaurar', 'error'); return; }
            var data = typeof txData === 'string' ? JSON.parse(txData) : txData;
            db.collection('contasFixas').add({
                userId: currentUser.uid,
                name: (data.description || '').replace(' (Conta Fixa)', ''),
                value: data.value || 0,
                category: data.category || '📦',
                dueDay: data.dueDay || 10,
                paid: false,
                createdAt: new Date().toISOString()
            }).then(function () {
                // Remove from localStorage trash
                var trash = getTrashFromStorage().filter(function (i) { return i.id !== trashId; });
                saveTrashToStorage(trash);
                updateTrashList();
                showNotification('Conta fixa restaurada!', 'success');
            }).catch(function (e) {
                console.error('Erro ao restaurar conta fixa:', e);
                showNotification('Erro ao restaurar conta fixa', 'error');
            });
        }

        // Permanently delete a conta fixa from the local trash (it's already gone from Firestore)
        function deleteContaFixaPermanentlyFromTrash(trashId) {
            if (!confirm(t('deletePermanentConfirm'))) return;
            var trash = getTrashFromStorage().filter(function (i) { return i.id !== trashId; });
            saveTrashToStorage(trash);
            updateTrashList();
            showNotification(t('transactionDeletedPerm'), 'warning');
        }

        function showAddGoalModal() { showModal('addGoalModal'); }
        function addGoal() {
            if (!currentUser) {
                showNotification("Faça login para salvar", "error");
                return;
            }
            const d = document.getElementById('goalDescription').value.trim();
            const tg = parseFloat(document.getElementById('goalTarget').value);
            const c = parseFloat(document.getElementById('goalCurrent').value) || 0;
            
            if (!d || !tg || tg <= 0) {
                showNotification(t('fillGoalFields'), 'error');
                return;
            }
            
            if (d.length < 2 || d.length > 100) {
                showNotification('Descrição deve ter entre 2 e 100 caracteres', 'error');
                return;
            }
            
            if (c > tg) {
                showNotification(t('currentNotGreater'), 'error');
                return;
            }
            
            if (tg > 999999.99) {
                showNotification('Meta não pode exceder 999.999,99', 'error');
                return;
            }

            db.collection('goals').add({
                userId: currentUser.uid,
                description: escapeHtml(d),
                target: tg,
                current: c,
                order: goals.length,
                createdAt: new Date().toISOString()
            }).then(() => {
                showNotification(t('goalAdded'), 'success');
                closeModal('addGoalModal');
                document.getElementById('addGoalForm').reset();
            }).catch(error => {
                console.error("Erro ao adicionar meta: ", error);
                showNotification("Erro ao salvar no servidor: " + (error.message || "desconhecido"), "error");
            });
        }
        function editGoal(id) { const g = goals.find(g => g.id === id); if (!g) return; editingGoalId = id; document.getElementById('editGoalDescription').value = g.description; document.getElementById('editGoalTarget').value = g.target; document.getElementById('editGoalCurrent').value = g.current; showModal('editGoalModal'); }
        function saveGoalEdit() {
            const d = document.getElementById('editGoalDescription').value.trim();
            const tg = parseFloat(document.getElementById('editGoalTarget').value);
            const c = parseFloat(document.getElementById('editGoalCurrent').value) || 0;
            
            if (!d || !tg || tg <= 0) {
                showNotification(t('fillGoalCorrect'), 'error');
                return;
            }
            
            if (d.length < 2 || d.length > 100) {
                showNotification('Descrição deve ter entre 2 e 100 caracteres', 'error');
                return;
            }
            
            if (c > tg) {
                showNotification(t('currentNotGreater'), 'error');
                return;
            }
            
            if (tg > 999999.99) {
                showNotification('Meta não pode exceder 999.999,99', 'error');
                return;
            }

            db.collection('goals').doc(editingGoalId).update({
                description: escapeHtml(d),
                target: tg,
                current: c,
                userId: currentUser.uid
            }).then(() => {
                showNotification(t('goalEdited'), 'success');
                closeModal('editGoalModal');
            }).catch(e => {
                console.error("Erro ao editar meta:", e);
                showNotification("Erro ao salvar meta: " + (e.message || "desconhecido"), "error");
            });
        }
        function deleteGoal(id) {
            if (confirm(t('deleteGoalConfirm'))) {
                db.collection('goals').doc(id).delete()
                    .then(() => showNotification(t('goalDeleted'), 'success'))
                    .catch(e => console.error("Erro ao deletar:", e));
            }
        }
        function moveGoal(id, dir) {
            const sortedGoals = [...goals].sort((a, b) => (a.order || 0) - (b.order || 0));
            const i = sortedGoals.findIndex(g => g.id === id);
            const ni = i + dir;
            if (ni < 0 || ni >= sortedGoals.length) return;

            const goalA = sortedGoals[i];
            const goalB = sortedGoals[ni];

            const batch = db.batch();
            batch.update(db.collection('goals').doc(String(goalA.id)), { order: goalB.order });
            batch.update(db.collection('goals').doc(String(goalB.id)), { order: goalA.order });

            batch.commit().catch(e => console.error("Erro ao mover:", e));
        }

        function updateTransactionsList() { const l = document.getElementById('transactionsList'); const a = getActiveTransactions(); if (a.length === 0) { l.innerHTML = '<div class="empty-state">' + t('noTransactionsFoundShort') + '</div>'; return; } const s = [...a].sort((a, b) => new Date(b.date) - new Date(a.date)); l.innerHTML = s.map(tx => renderTransactionItem(tx)).join(''); }
        function updateGoalsList() {
            const l = document.getElementById('goalsList');
            if (!l) return;
            if (goals.length === 0) {
                l.innerHTML = '<div class="empty-state">' + t('noGoals') + '</div>';
                return;
            }
            const s = [...goals].sort((a, b) => (a.order || 0) - (b.order || 0));
            l.innerHTML = s.map((g, i) => {
                const target = g.target || 1;
                const current = g.current || 0;
                const p = Math.min((current / target) * 100, 100);
                const r = Math.max(target - current, 0);
                return `<div class="goal-item">
                    <div class="goal-header">
                        <div class="goal-info">
                            <h3>${escapeHtml(g.description || '')}</h3>
                            <div class="goal-values">${formatCurrency(current)} de ${formatCurrency(target)}</div>
                        </div>
                        <div class="goal-actions">
                            ${i > 0 ? `<button class="action-btn move-up" onclick="moveGoal('${g.id}',-1)" title="Mover para cima"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
                            ${i < s.length - 1 ? `<button class="action-btn move-down" onclick="moveGoal('${g.id}',1)" title="Mover para baixo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
                            <button class="action-btn edit" onclick="editGoal('${g.id}')" title="${t('edit')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button class="action-btn delete" onclick="deleteGoal('${g.id}')" title="${t('delete')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                        </div>
                    </div>
                    <div class="goal-progress">
                        <div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div>
                        <div class="progress-text"><span>${p.toFixed(1)}% conclu\u00EDdo</span><span>Faltam ${formatCurrency(r)}</span></div>
                    </div>
                </div>`;
            }).join('');
        }
        function updateDailyTransactions() {
            const dateInput = document.getElementById('transactionDate');
            const sd = dateInput ? dateInput.value : '';
            const daily = sd ? getActiveTransactions().filter(t => t.date === sd) : [];
            updateSummaryStats('daily', daily);
            const l = document.getElementById('dailyTransactionsList');
            if (!l) return;
            if (daily.length === 0) {
                l.innerHTML = '<div class="empty-state">' + t('noTransactionsDay') + '</div>';
                return;
            }
            const sortedDaily = [...daily].sort((a, b) => {
                if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
                return String(b.time || '').localeCompare(String(a.time || ''));
            });
            l.innerHTML = sortedDaily.map(tx => renderTransactionItem(tx)).join('');
        }

        function toggleSummary(type) { const c = document.getElementById(type + 'SummaryContent'); if (c && c.previousElementSibling) { const ic = c.previousElementSibling.querySelector('.expand-icon'); c.classList.toggle('expanded'); if (ic) ic.classList.toggle('expanded'); } }
        function updateDailySummary() { const el = document.getElementById('dailySummaryDate'); if (!el || !el.value) return; const daily = getActiveTransactions().filter(t => t.date === el.value); updateSummaryView('dailySummary', daily); }
        function updateWeeklySummary() { const el = document.getElementById('weeklySummaryDate'); if (!el || !el.value) return; const wi = el.value; const [yr, wn] = wi.split('-W'); if (!yr || !wn || isNaN(parseInt(wn, 10))) return; const fy = new Date(Date.UTC(parseInt(yr, 10), 0, 1)); const ds = (wn - 1) * 7; const sd = new Date(fy.getTime() + ds * 86400000); const dow = sd.getUTCDay(); const diff = sd.getUTCDate() - dow + (dow === 0 ? -6 : 1); const mon = new Date(sd.setUTCDate(diff)); const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6); const ss = mon.toISOString().split('T')[0]; const es = sun.toISOString().split('T')[0]; const weekly = getActiveTransactions().filter(t => t.date >= ss && t.date <= es); updateSummaryView('weeklySummary', weekly); }
        function updateMonthlySummary() { const el = document.getElementById('monthlySummaryDate'); if (!el || !el.value) return; const monthly = getActiveTransactions().filter(t => t.date.startsWith(el.value)); updateSummaryView('monthlySummary', monthly); }
        function updateYearlySummary() { const el = document.getElementById('yearlySummaryDate'); if (!el || !el.value) return; const yearly = getActiveTransactions().filter(t => t.date.startsWith(el.value)); updateSummaryView('yearlySummary', yearly); }
        function updateSummaryView(pfx, list) { updateSummaryStats(pfx, list); const l = document.getElementById(pfx + 'Transactions'); if (!l) return; if (list.length === 0) { l.innerHTML = '<div class="empty-state">' + t('noTransactionsPeriod') + '</div>'; return; } const s = [...list].sort((a, b) => new Date(b.date) - new Date(a.date)); l.innerHTML = s.map(tx => renderTransactionItem(tx)).join(''); }
        function updateSummaryStats(pfx, list) { const inc = list.filter(t => t.type === 'income').reduce((s, t) => s + (t.value || 0), 0); const exp = list.filter(t => t.type === 'expense').reduce((s, t) => s + (t.value || 0), 0); const bal = inc - exp; const incEl = document.getElementById(pfx + 'Income'); if (incEl) incEl.textContent = formatCurrency(inc); const expEl = document.getElementById(pfx + 'Expense'); if (expEl) expEl.textContent = formatCurrency(exp); const balEl = document.getElementById(pfx + 'Balance'); if (balEl) balEl.textContent = formatCurrency(bal); const incomeBreakdownEl = document.getElementById(pfx + 'IncomeBreakdown'); if (incomeBreakdownEl) { const incomeTxs = list.filter(t => t.type === 'income'); const breakdown = {}; incomeTxs.forEach(tx => { if (!breakdown[tx.category]) breakdown[tx.category] = 0; breakdown[tx.category] += (tx.value || 0); }); const sortedBreakdown = Object.entries(breakdown).filter(([cat, val]) => val > 0).sort((a, b) => b[1] - a[1]); const breakdownText = sortedBreakdown.map(([cat, val]) => `${(getCategoryLabel(cat) || '').split(' ')[1] || getCategoryLabel(cat)}: ${formatCurrency(val)}`).join(', '); incomeBreakdownEl.textContent = breakdownText; } }

        function showExportExcelModal() { document.getElementById('exportExcelForm').reset(); document.getElementById('exportDateGroup').style.display = 'none'; showModal('exportExcelModal'); }
        function updateExportDateField() {
            const p = document.getElementById('exportPeriod').value;
            const dg = document.getElementById('exportDateGroup');
            const cdg = document.getElementById('exportCustomDateGroup');
            const di = document.getElementById('exportDate');
            const dl = document.getElementById('exportDateLabel');

            if (p === 'all') {
                dg.style.display = 'none';
                cdg.style.display = 'none';
            } else if (p === 'custom') {
                dg.style.display = 'none';
                cdg.style.display = 'block';
            } else {
                dg.style.display = 'block';
                cdg.style.display = 'none';
                di.type = p === 'month' ? 'month' : 'number';
                dl.textContent = p === 'month' ? t('month') : t('year');
                if (p === 'year') {
                    di.min = '2020';
                    di.max = '2030';
                    di.value = new Date().getFullYear();
                } else {
                    const n = new Date();
                    di.value = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
                }
            }
        }
        function exportFilteredToExcel() {
            const p = document.getElementById('exportPeriod').value;
            const typeFilter = document.getElementById('exportType').value;
            const cf = document.getElementById('exportCategory').value;
            const dv = document.getElementById('exportDate').value;
            const dStart = document.getElementById('exportStartDate').value;
            const dEnd = document.getElementById('exportEndDate').value;

            let f = [...getActiveTransactions()];

            let periodText = '';

            if (p === 'month' && dv) {
                f = f.filter(t => t.date.startsWith(dv));
                periodText = `Mes: ${dv}`;
            } else if (p === 'year' && dv) {
                f = f.filter(t => t.date.startsWith(dv));
                periodText = `Ano: ${dv}`;
            } else if (p === 'custom') {
                if (!dStart || !dEnd) {
                    showNotification("Selecione data inicial e final", "warning");
                    return;
                }
                f = f.filter(t => t.date >= dStart && t.date <= dEnd);
                periodText = `De: ${formatDateForDisplay(dStart)} Ate: ${formatDateForDisplay(dEnd)}`;
            } else {
                periodText = 'Todos os registros';
            }

            // Filter by Type
            if (typeFilter !== 'all') {
                f = f.filter(t => t.type === typeFilter);
            }

            // Filter by Category
            if (cf !== 'all') {
                f = f.filter(t => t.category === cf);
            }

            if (f.length === 0) {
                showNotification(t('noTransactionsFilters'), 'warning');
                return;
            }

            exportToExcel(f, `relatorio-financeiro-${getTodayInBrasiliaISO()}`, periodText);
            closeModal('exportExcelModal');
        }
        function exportToExcel(data, filename, periodText) {
            try {
                const isEn = currentLang === 'en';
                const isEs = currentLang === 'es';

                // Report Metadata
                const genLocale = isEs ? 'es-ES' : (isEn ? 'en-US' : 'pt-BR');
                const genDate = new Date().toLocaleString(genLocale);
                const titleStr = isEs ? "Informe Financiero" : (isEn ? "Financial Report" : "Relatorio Financeiro");
                const genStr = isEs ? "Generado el: " : (isEn ? "Generated on: " : "Gerado em: ");
                const perStr = isEs ? "Período: " : (isEn ? "Period: " : "Periodo: ");
                const meta = [
                    { "A": titleStr },
                    { "A": genStr + genDate },
                    { "A": perStr + (periodText || "") },
                    { "A": "" } // Empty row
                ];

                const cD = isEs ? 'Fecha' : (isEn ? 'Date' : 'Data');
                const cTi = isEs ? 'Hora' : (isEn ? 'Time' : 'Hora');
                const cT = isEs ? 'Tipo' : (isEn ? 'Type' : 'Tipo');
                const cV = isEs ? 'Valor' : (isEn ? 'Value' : 'Valor');
                const cC = isEs ? 'Categoría' : (isEn ? 'Category' : 'Categoria');
                const cDe = isEs ? 'Descripción' : (isEn ? 'Description' : 'Descricao');

                const td = data.map(tx => ({
                    [cD]: formatDateForDisplay(tx.date),
                    [cTi]: formatTimeForDisplay(tx.time),
                    [cT]: tx.type === 'income' ? t('income') : t('expense'),
                    [cV]: tx.value,
                    [cC]: getCategoryLabel(tx.category),
                    [cDe]: tx.description
                }));

                const ti = data.filter(t => t.type === 'income').reduce((s, t) => s + t.value, 0);
                const te = data.filter(t => t.type === 'expense').reduce((s, t) => s + t.value, 0);
                const sC = isEs ? 'Resumen' : (isEn ? 'Summary' : 'Resumo');

                const totalIncLabel = isEs ? 'Total de Ingresos' : (isEn ? 'Total Income' : 'Total de Receitas');
                const totalExpLabel = isEs ? 'Total de Gastos' : (isEn ? 'Total Expenses' : 'Total de Despesas');
                const balanceLabel = isEs ? 'Saldo' : (isEn ? 'Balance' : 'Saldo');

                const sd = [
                    { [sC]: totalIncLabel, [cV]: ti },
                    { [sC]: totalExpLabel, [cV]: te },
                    { [sC]: balanceLabel, [cV]: ti - te }
                ];

                const wb = XLSX.utils.book_new();

                // Create Worksheet with Metadata
                const ws = XLSX.utils.json_to_sheet(td, { origin: "A5" }); // Start data at A5
                XLSX.utils.sheet_add_json(ws, meta, { skipHeader: true, origin: "A1" });

                const sheetTransactions = isEs ? 'Transacciones' : (isEn ? 'Transactions' : 'Transacoes');
                const sheetSummary = isEs ? 'Resumen' : (isEn ? 'Summary' : 'Resumo');
                XLSX.utils.book_append_sheet(wb, ws, sheetTransactions);
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sd), sheetSummary);

                XLSX.writeFile(wb, `${filename}.xlsx`);
                showNotification(t('exportSuccess'), 'success');
            } catch (e) {
                console.error('Erro:', e);
                showNotification(t('exportError'), 'error');
            }
        }

        function formatCurrency(v) { const f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); return f.replace(/\u00A0/g, ''); }
        function escapeHtml(text) { if (text == null || typeof text !== 'string') return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
        function formatDateForDisplay(ds) {
            if (!ds || typeof ds !== 'string') return '';
            const p = ds.split('-');
            if (p.length !== 3) return ds;
            var lang = (typeof currentLang !== 'undefined' ? currentLang : null) || localStorage.getItem('lang') || 'pt-BR';
            if (lang === 'en') {
                return `${p[1]}/${p[2]}/${p[0]}`;
            }
            return `${p[2]}/${p[1]}/${p[0]}`;
        }
        function formatTimeForDisplay(timeStr) {
            if (!timeStr || typeof timeStr !== 'string') return '';
            var lang = (typeof currentLang !== 'undefined' ? currentLang : null) || localStorage.getItem('lang') || 'pt-BR';
            if (lang !== 'en') return timeStr;
            var clean = timeStr.trim();
            if (/am|pm/i.test(clean)) return clean;
            var parts = clean.split(':');
            if (parts.length < 2) return clean;
            var h = parseInt(parts[0], 10);
            var m = parts[1].slice(0, 2);
            if (isNaN(h)) return clean;
            var ap = h >= 12 ? 'PM' : 'AM';
            var h12 = h % 12 || 12;
            return h12 + ':' + m + ' ' + ap;
        }
        function renderTransactionItem(tx) {
            const fav = tx.favorite ? `<svg class="favorited" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
            const timeDisplay = tx.time ? ` \u2022 ${formatTimeForDisplay(tx.time)}` : '';
            const receiptBtn = (tx.receiptBase64 || tx.receiptPath) ? `<button class="action-btn receipt-btn" onclick="viewTransactionReceipt('${tx.id}')" title="${t('viewReceipt')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></button>` : '';
            return `<div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-description">${escapeHtml(tx.description)}</div>
                    <div class="transaction-meta">${getCategoryLabel(tx.category)} \u2022 ${formatDateForDisplay(tx.date)}${timeDisplay}</div>
                </div>
                <div class="transaction-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.value)}</div>
                <div class="transaction-actions">
                    ${receiptBtn}
                    <button class="action-btn favorite-btn" onclick="toggleFavorite('${tx.id}');updateAllViews();performSearch();" title="${tx.favorite ? 'Desfavoritar' : 'Favoritar'}">${fav}</button>
                    <button class="action-btn edit" onclick="editTransaction('${tx.id}')" title="${t('edit')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="action-btn delete" onclick="deleteTransaction('${tx.id}')" title="${t('delete')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
            </div>`;
        }

        let currentReceiptViewerTx = null;
        let currentReceiptViewerData = null;
        let currentReceiptViewerIsPdf = false;

        function viewTransactionReceipt(txId) {
            const tx = transactions.find(t => String(t.id) === String(txId));
            if (!tx) return;

            currentReceiptViewerTx = tx;
            currentReceiptViewerData = null;
            currentReceiptViewerIsPdf = false;

            const titleEl = document.getElementById('receiptViewerTitle');
            const subtitleEl = document.getElementById('receiptViewerSubtitle');
            const contentEl = document.getElementById('receiptViewerContent');
            const downloadBtn = document.getElementById('receiptViewerDownloadBtn');
            const downloadText = document.getElementById('receiptViewerDownloadText');
            const openTabText = document.getElementById('receiptViewerOpenTabText');

            if (titleEl) titleEl.textContent = t('viewReceiptModalTitle');
            if (downloadText) downloadText.textContent = t('downloadReceipt');
            if (openTabText) openTabText.textContent = t('openInNewTab');
            if (subtitleEl) {
                const typeSign = tx.type === 'income' ? '+' : '-';
                subtitleEl.textContent = `${escapeHtml(tx.description || t('newTransaction'))} • ${typeSign}${formatCurrency(tx.value)} • ${formatDateForDisplay(tx.date)}`;
            }

            if (tx.receiptBase64) {
                currentReceiptViewerData = tx.receiptBase64;
                currentReceiptViewerIsPdf = tx.receiptBase64.startsWith('data:application/pdf');
                if (currentReceiptViewerIsPdf) {
                    contentEl.innerHTML = `<iframe src="${tx.receiptBase64}" title="Comprovante PDF" style="width:100%; height:55vh; border:none; border-radius:10px; background:#ffffff;"></iframe>`;
                } else {
                    contentEl.innerHTML = `<img src="${tx.receiptBase64}" alt="Comprovante" style="max-width:100%; max-height:58vh; object-fit:contain; border-radius:10px; box-shadow:0 6px 22px rgba(0,0,0,0.35); display:block; margin:0 auto;">`;
                }
                if (downloadBtn) downloadBtn.style.display = 'inline-flex';
                showModal('receiptViewerModal');
            } else if (tx.receiptPath) {
                const isPdf = tx.receiptPath.toLowerCase().endsWith('.pdf');
                currentReceiptViewerIsPdf = isPdf;
                contentEl.innerHTML = `
                    <div style="padding: 2.5rem; text-align: center; color: var(--dark-text-3);">
                        <div style="width:36px; height:36px; border:3px solid rgba(255,255,255,0.15); border-top-color:var(--primary); border-radius:50%; animation:spin 0.9s linear infinite; margin:0 auto 1rem;"></div>
                        <span>${t('receiptLoading')}</span>
                    </div>
                `;
                if (downloadBtn) downloadBtn.style.display = 'none';
                showModal('receiptViewerModal');

                storage.ref(tx.receiptPath).getDownloadURL().then(url => {
                    currentReceiptViewerData = url;
                    if (isPdf) {
                        contentEl.innerHTML = `<iframe src="${url}" title="Comprovante PDF" style="width:100%; height:55vh; border:none; border-radius:10px; background:#ffffff;"></iframe>`;
                    } else {
                        contentEl.innerHTML = `<img src="${url}" alt="Comprovante" style="max-width:100%; max-height:58vh; object-fit:contain; border-radius:10px; box-shadow:0 6px 22px rgba(0,0,0,0.35); display:block; margin:0 auto;">`;
                    }
                    if (downloadBtn) downloadBtn.style.display = 'inline-flex';
                }).catch(err => {
                    console.error('Erro ao carregar comprovante do Storage:', err);
                    contentEl.innerHTML = `
                        <div style="padding:2rem; text-align:center; color:var(--danger, #ef4444);">
                            <p style="font-weight:600; margin-bottom:0.5rem;">Não foi possível carregar o arquivo da nuvem.</p>
                            <p style="font-size:0.85rem; opacity:0.8;">Verifique a conexão ou permissões de leitura.</p>
                        </div>
                    `;
                });
            }
        }
        window.viewTransactionReceipt = viewTransactionReceipt;

        function downloadCurrentReceipt() {
            if (!currentReceiptViewerTx || !currentReceiptViewerData) {
                showNotification(t('saveError'), 'error');
                return;
            }
            const tx = currentReceiptViewerTx;
            const desc = (tx.description || 'comprovante').trim().replace(/[^a-zA-Z0-9_\u00C0-\u00FF-]/g, '_');
            const date = tx.date || new Date().toISOString().slice(0, 10);
            const isPdf = currentReceiptViewerIsPdf || (tx.receiptPath && tx.receiptPath.toLowerCase().endsWith('.pdf'));
            const ext = isPdf ? 'pdf' : 'jpg';
            const filename = `comprovante_${desc}_${date}.${ext}`;

            if (currentReceiptViewerData.startsWith('data:')) {
                try {
                    const parts = currentReceiptViewerData.split(',');
                    const mimeMatch = parts[0].match(/:(.*?);/);
                    const mime = mimeMatch ? mimeMatch[1] : (isPdf ? 'application/pdf' : 'image/jpeg');
                    const byteString = atob(parts[1]);
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) {
                        ia[i] = byteString.charCodeAt(i);
                    }
                    const blob = new Blob([ia], { type: mime });
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                    }, 1200);
                    showNotification(t('receiptDownloaded'), 'success');
                    return;
                } catch (e) {
                    console.warn('Fallback download base64:', e);
                    const a = document.createElement('a');
                    a.href = currentReceiptViewerData;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => document.body.removeChild(a), 500);
                    showNotification(t('receiptDownloaded'), 'success');
                    return;
                }
            }

            // Remote URL
            showNotification(currentLang === 'es' ? 'Descargando comprobante...' : (currentLang === 'en' ? 'Downloading receipt...' : 'Baixando comprovante...'), 'info');
            fetch(currentReceiptViewerData)
                .then(res => res.blob())
                .then(blob => {
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                    }, 1200);
                    showNotification(t('receiptDownloaded'), 'success');
                })
                .catch(err => {
                    console.warn('Fetch blob falhou, abrindo link com atributo download:', err);
                    const a = document.createElement('a');
                    a.href = currentReceiptViewerData;
                    a.target = '_blank';
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => document.body.removeChild(a), 500);
                });
        }
        window.downloadCurrentReceipt = downloadCurrentReceipt;

        function openReceiptInNewTab() {
            if (!currentReceiptViewerData && !currentReceiptViewerTx) return;
            const tx = currentReceiptViewerTx;
            const title = `Comprovante - ${escapeHtml(tx.description || 'Lançamento')}`;
            const desc = escapeHtml(tx.description || '');
            const val = formatCurrency(tx.value);
            const date = formatDateForDisplay(tx.date);
            const isPdf = currentReceiptViewerIsPdf;

            const w = window.open('');
            if (!w) {
                window.open(currentReceiptViewerData, '_blank');
                return;
            }

            const downloadBtnLabel = t('downloadReceipt');
            const filename = `comprovante_${(tx.description||'transacao').replace(/[^a-zA-Z0-9_\u00C0-\u00FF-]/g,'_')}_${tx.date}.${isPdf?'pdf':'jpg'}`;
            const contentTag = isPdf
                ? `<iframe src="${currentReceiptViewerData}" style="width:100%; height:82vh; border:none; border-radius:12px; background:#fff;"></iframe>`
                : `<img src="${currentReceiptViewerData}" alt="Comprovante" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:12px; box-shadow:0 12px 35px rgba(0,0,0,0.5);">`;

            w.document.write(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin:0; background:#0f172a; color:#f1f5f9; font-family:system-ui,-apple-system,sans-serif; display:flex; flex-direction:column; align-items:center; min-height:100vh; padding:1.5rem 1rem; box-sizing:border-box; }
        .header-bar { width:100%; max-width:920px; display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:1rem; }
        .info { font-size:1.05rem; font-weight:600; }
        .actions { display:flex; gap:0.75rem; }
        .btn { background:#10b981; color:#062316; border:none; padding:0.6rem 1.2rem; border-radius:8px; font-weight:700; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-size:0.95rem; }
        .btn:hover { background:#34d399; }
        .content-box { width:100%; max-width:920px; display:flex; justify-content:center; align-items:center; }
    </style>
</head>
<body>
    <div class="header-bar">
        <div class="info">🧾 ${desc} • ${val} (${date})</div>
        <div class="actions">
            <a href="${currentReceiptViewerData}" download="${filename}" class="btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                ${downloadBtnLabel}
            </a>
        </div>
    </div>
    <div class="content-box">
        ${contentTag}
    </div>
</body>
</html>`);
            w.document.close();
        }
        window.openReceiptInNewTab = openReceiptInNewTab;

        // Logic for Transaction Type Toggle
        let currentTransactionType = 'income';

        function setTransactionType(type) {
            currentTransactionType = type;
            const bg = document.getElementById('segmentedBackground');
            const btnInc = document.getElementById('btnIncome');
            const btnExp = document.getElementById('btnExpense');
            const valInput = document.getElementById('transactionValue');

            const valSection = document.getElementById('valueDisplaySection');

            if (type === 'income') {
                if (bg) {
                    bg.style.transform = 'translateX(0)';
                    bg.classList.remove('bg-expense');
                }
                if (btnInc) btnInc.classList.add('active');
                if (btnExp) btnExp.classList.remove('active');
                if (valInput) valInput.classList.remove('expense-color');
                if (valSection) valSection.classList.remove('expense-mode');
            } else {
                if (bg) {
                    bg.style.transform = 'translateX(100%)';
                    bg.classList.add('bg-expense');
                }
                if (btnExp) btnExp.classList.add('active');
                if (btnInc) btnInc.classList.remove('active');
                if (valInput) valInput.classList.add('expense-color');
                if (valSection) valSection.classList.add('expense-mode');
            }
        }
        // Initialize default
        document.addEventListener('DOMContentLoaded', () => {
            setTransactionType('income');
        });

        function saveNewTransaction() {
            addTransaction(currentTransactionType);
        }

        let isHeaderBalanceVisible = localStorage.getItem('headerBalanceVisible') !== 'false';

        function triggerWealthBurst(el) {
            const icon = el || document.querySelector('.header-icon-circle');
            if (!icon) return;
            icon.classList.remove('bursting');
            void icon.offsetWidth;
            icon.classList.add('bursting');
            setTimeout(() => {
                if (icon) icon.classList.remove('bursting');
            }, 700);
        }
        window.triggerWealthBurst = triggerWealthBurst;

        function toggleHeaderBalanceVisibility() {
            isHeaderBalanceVisible = !isHeaderBalanceVisible;
            localStorage.setItem('headerBalanceVisible', isHeaderBalanceVisible);
            updateHeaderBalance();
        }

        function updateHeaderBalance() {
            let netTransactions = 0;
            if (typeof cfBalanceSavedAt !== 'undefined' && cfBalanceSavedAt) {
                const cutoff = cfBalanceSavedAt;
                const txAfterSave = getActiveTransactions().filter(tx => {
                    const txTime = tx.createdAt || (tx.date ? tx.date + 'T00:00:00.000Z' : null);
                    return txTime && txTime >= cutoff;
                });
                const totalIncome = txAfterSave.filter(tx => tx.type === 'income').reduce((s, tx) => s + (tx.value || 0), 0);
                const totalExpense = txAfterSave.filter(tx => tx.type === 'expense').reduce((s, tx) => s + (tx.value || 0), 0);
                netTransactions = totalIncome - totalExpense;
            }
            const effectiveBalance = (typeof cfBalance !== 'undefined' ? cfBalance : 0) + netTransactions;

            const balanceElement = document.getElementById('headerBalanceAmount');
            const iconElement = document.getElementById('headerBalanceEyeIcon');

            if (balanceElement && iconElement) {
                if (isHeaderBalanceVisible) {
                    balanceElement.textContent = formatCurrency(effectiveBalance);
                    document.getElementById('headerBalanceEyeBtn').style.opacity = '1';
                    iconElement.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
                } else {
                    balanceElement.textContent = 'R$ •••••';
                    document.getElementById('headerBalanceEyeBtn').style.opacity = '0.6';
                    iconElement.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
                }
            }
        }

        // updateAllViews is defined at line 257 with full error protection and user isolation

        function toggleSearch() {
            const searchTabBtn = document.querySelector('.menu-item[onclick*="showTab(\'search\'"]');
            if (searchTabBtn) {
                showTab('search', searchTabBtn);
            } else {
                // Fallback
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
                document.getElementById('search').classList.add('active');
            }
        }

        function copyDeveloperPixKey() {
            const key = document.getElementById('developerPixKey').textContent.trim();
            const fallbackCopy = () => {
                const input = document.createElement('textarea');
                input.value = key;
                input.style.position = 'fixed';
                input.style.opacity = '0';
                document.body.appendChild(input);
                input.select();
                const copied = document.execCommand('copy');
                input.remove();
                if (!copied) throw new Error('Clipboard unavailable');
            };
            const copy = navigator.clipboard && window.isSecureContext
                ? navigator.clipboard.writeText(key)
                : Promise.resolve().then(fallbackCopy);
            copy.then(() => showNotification('Chave PIX copiada.', 'success'))
                .catch(() => showNotification(`Chave PIX: ${key}`, 'info'));
        }

        function showModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }
        function showNotification(msg, type = 'info') { const n = document.getElementById('notifications'); const el = document.createElement('div'); el.className = `notification ${type}`; el.textContent = msg; n.appendChild(el); setTimeout(() => { el.remove(); }, 1500); }
        function escapeHtml(text) { if (!text) return ''; const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}; return String(text).replace(/[&<>"']/g, m => map[m]); }

        let isSyncingFromRemote = false;
        async function loadDataFromFirebase() {
            if (!currentUser) return;
            try {
                // Real-time synchronization for transactions
                db.collection('users').doc(currentUser.uid).collection('data').doc('transactions')
                    .onSnapshot((doc) => {
                        if (doc.exists && !doc.metadata.hasPendingWrites) {
                            const remoteList = doc.data().list || [];
                            // Deep check if really changed
                            if (JSON.stringify(remoteList) !== JSON.stringify(transactions)) {
                                console.log("Atualizando transações via remote sync");
                                transactions = remoteList;
                                localStorage.setItem('financialTransactions_v2', JSON.stringify(transactions));
                                updateAllViews();
                                performSearch();
                            }
                        }
                    });

                // Real-time synchronization for goals
                db.collection('users').doc(currentUser.uid).collection('data').doc('goals')
                    .onSnapshot((doc) => {
                        if (doc.exists && !doc.metadata.hasPendingWrites) {
                            const remoteList = doc.data().list || [];
                            if (JSON.stringify(remoteList) !== JSON.stringify(goals)) {
                                console.log("Atualizando metas via remote sync");
                                goals = remoteList;
                                localStorage.setItem('financialGoals_v2', JSON.stringify(goals));
                                updateAllViews();
                            }
                        }
                    });
            } catch (e) {
                console.error("Erro ao configurar listeners Firebase:", e);
            }
        }

        function manualCloudSync() {
            if (!currentUser) {
                showNotification("Faça login para sincronizar", "error");
                return;
            }
            showNotification("A sincronização agora é automática e em tempo real!", "info");
        }

        // REMOVIDO: saveDataToFirebase() antiga
        // Agora usando localStorage com isolamento por usuário (ver função saveData() acima)
        // Se precisar de Firestore no futuro, implementar com coleção global 'transactions'

        // REMOVIDO: checkScheduledBackup() e performAutoBackup() - backup agora é manual via exportData()

        // REMOVIDO: função saveData() antiga duplicada
        // Usar a função saveData() com isolamento por userId (linha ~4040)
        // REMOVIDO: função loadData() antiga duplicada
        // Usar a função loadData() com isolamento por userId (linha ~4060)
        function exportData() { try { const d = { transactions: transactions, goals: goals }; const ds = JSON.stringify(d, null, 2); const b = new Blob([ds], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `backup-financeiro-${getTodayInBrasiliaISO()}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); showNotification(t('backupExported'), 'success'); } catch (e) { showNotification(t('backupExportError'), 'error'); } }
        function importData(ev) {
            const f = ev.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = async function (e) {
                try {
                    const d = JSON.parse(e.target.result);
                    if (!d || !Array.isArray(d.transactions)) throw new Error('Invalid format');
                    if (!currentUser) { throw new Error('Faça login para importar'); }

                    if (confirm(t('importConfirm'))) {
                        showNotification('Iniciando importação...', 'info');
                        const batch = db.batch();
                        let count = 0;

                        d.transactions.forEach(t => {
                            const ref = db.collection('transactions').doc();
                            // Sanitize and ensure userId
                            const tx = { ...t, userId: currentUser.uid, deleted: t.deleted || false };
                            delete tx.id; // Let Firestore generate ID or use new ID
                            batch.set(ref, tx);
                            count++;
                        });

                        if (d.goals && Array.isArray(d.goals)) {
                            d.goals.forEach(g => {
                                const ref = db.collection('goals').doc();
                                const goal = { ...g, userId: currentUser.uid };
                                delete goal.id;
                                batch.set(ref, goal);
                                count++;
                            });
                        }

                        // Commit batch (note: limit is 500 ops, simple implementation assumes < 500 for now)
                        // For production, should implement chunking
                        if (count > 490) {
                            showNotification('Muitos itens para importar de uma vez. Importe arquivos menores.', 'error');
                            return;
                        }

                        await batch.commit();
                        showNotification(t('importSuccess'), 'success');
                    }
                } catch (err) {
                    showNotification('Erro ao importar: ' + err.message, 'error');
                    console.error(err);
                } finally {
                    ev.target.value = '';
                }
            };
            r.readAsText(f);
        }
        function clearAllData() {
            if (confirm(t('clearConfirm'))) {
                if (!currentUser) return;

                const batch = db.batch();
                let count = 0;

                transactions.forEach(t => {
                    batch.delete(db.collection('transactions').doc(t.id));
                    count++;
                });

                goals.forEach(g => {
                    batch.delete(db.collection('goals').doc(g.id));
                    count++;
                });

                if (count === 0) {
                    showNotification(t('allDataCleared'), 'warning');
                    return;
                }

                if (count > 490) {
                    // Fallback for large deletion: just delete one by one or warn
                    // ideally use Promise.all with chunked deletes
                    // Simple implementation:
                    console.warn("Too many items to batch delete, deleting individually via batch chunks not implemented yet.");
                }

                batch.commit().then(() => {
                    showNotification(t('allDataCleared'), 'warning');
                }).catch(e => {
                    console.error("Erro ao limpar dados:", e);
                    showNotification("Erro ao limpar dados", "error");
                });
            }
        }

        function setChartType(type) { currentChartType = type; document.querySelectorAll('.chart-type-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.type === type); }); updateChart(); }
        function toggleChartPeriodInputs() { const p = document.getElementById('chartPeriod').value; document.getElementById('chartCustomGroup').style.display = p === 'custom' ? 'block' : 'none'; document.getElementById('chartMonthGroup').style.display = p === 'month' ? 'block' : 'none'; document.getElementById('chartWeekGroup').style.display = p === 'week' ? 'block' : 'none'; document.getElementById('chartYearGroup').style.display = p === 'year' ? 'block' : 'none'; initChartPeriodInputs(); updateChart(); }
        function initChartPeriodInputs() { const n = new Date(); const y = n.getFullYear(); const m = String(n.getMonth() + 1).padStart(2, '0'); const mi = document.getElementById('chartMonth'); const wi = document.getElementById('chartWeek'); const yi = document.getElementById('chartYear'); if (mi && !mi.value) mi.value = `${y}-${m}`; if (yi && !yi.value) yi.value = y; if (wi && !wi.value) { const d = new Date(n); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const yw = d.getUTCFullYear(); const wn = Math.ceil((((d - new Date(Date.UTC(yw, 0, 1))) / 86400000) + 1) / 7); wi.value = `${yw}-W${String(wn).padStart(2, '0')}`; } }
        function getChartData() { const p = document.getElementById('chartPeriod').value; const tf = document.getElementById('chartTypeFilter').value; const n = new Date(); let ss, es; if (p === 'custom') { ss = document.getElementById('chartStartDate').value; es = document.getElementById('chartEndDate').value; if (!ss || !es) return []; } else if (p === 'month') { const v = document.getElementById('chartMonth').value; if (!v) return []; ss = v + '-01'; const [y, m] = v.split('-'); const ld = new Date(parseInt(y), parseInt(m), 0).getDate(); es = `${v}-${String(ld).padStart(2, '0')}`; } else if (p === 'week') { const wv = document.getElementById('chartWeek').value; if (!wv) return []; const [yr, wn] = wv.split('-W'); if (!yr || !wn) return []; const fy = new Date(Date.UTC(parseInt(yr, 10), 0, 1)); const ds = (parseInt(wn, 10) - 1) * 7; const sd = new Date(fy.getTime() + ds * 86400000); const dow = sd.getUTCDay(); const diff = sd.getUTCDate() - dow + (dow === 0 ? -6 : 1); const mon = new Date(sd); mon.setUTCDate(diff); const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6); ss = mon.toISOString().split('T')[0]; es = sun.toISOString().split('T')[0]; } else if (p === 'year') { const y = document.getElementById('chartYear').value; if (!y) return []; ss = `${y}-01-01`; es = `${y}-12-31`; } else if (p === 'last3') { const d = new Date(n); d.setMonth(d.getMonth() - 3); ss = d.toISOString().split('T')[0]; es = n.toISOString().split('T')[0]; } else if (p === 'last6') { const d = new Date(n); d.setMonth(d.getMonth() - 6); ss = d.toISOString().split('T')[0]; es = n.toISOString().split('T')[0]; } else { ss = `${n.getFullYear()}-01-01`; es = n.toISOString().split('T')[0]; } let list = getActiveTransactions().filter(tx => tx.date >= ss && tx.date <= es); if (tf === 'income') list = list.filter(tx => tx.type === 'income'); else if (tf === 'expense') list = list.filter(tx => tx.type === 'expense'); const favFilter = document.getElementById('chartFavorites').value; if (favFilter === 'favorites') list = list.filter(tx => tx.favorite); else if (favFilter === 'nonfavorites') list = list.filter(tx => !tx.favorite); const selectedCats = Array.from(selectedChartCategories); if (selectedCats.length > 0) list = list.filter(tx => selectedCats.includes(tx.category)); const groupBy = document.getElementById('chartGroupBy').value; if (groupBy === 'date') { const bc = {}; list.forEach(tx => { if (!bc[tx.date]) bc[tx.date] = 0; bc[tx.date] += tx.value; }); return Object.entries(bc).map(([date, val]) => ({ label: formatDateForDisplay(date), value: val })).sort((a, b) => a.label.localeCompare(b.label)); } else { const bc = {}; list.forEach(tx => { if (!bc[tx.category]) bc[tx.category] = 0; bc[tx.category] += tx.value; }); if (tf === 'both') { const ti = list.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.value, 0); const te = list.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.value, 0); const r = []; if (ti > 0) r.push({ label: '\u{1F4B0} ' + t('income'), value: ti }); if (te > 0) r.push({ label: '\u{1F4B8} ' + t('expense'), value: te }); return r; } return Object.entries(bc).map(([cat, val]) => ({ label: categories[cat] || cat, value: val })).sort((a, b) => b.value - a.value); } }
        function updateChart() { const cv = document.getElementById('financeChart'); if (!cv) return; const data = getChartData(); if (data.length === 0) { if (financeChartInstance) { financeChartInstance.destroy(); financeChartInstance = null; } return; } const isDark = document.body.classList.contains('dark'); const tc = isDark ? '#f1f5f9' : '#1e293b'; const gc = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; if (financeChartInstance) financeChartInstance.destroy(); const cd = { labels: data.map(d => d.label), datasets: [{ data: data.map(d => d.value), backgroundColor: ['#0D9488', '#14B8A6', '#059669', '#F59E0B', '#DC2626', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#6366F1'], borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)', borderWidth: 2 }] }; const cfg = { type: currentChartType, data: cd, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11, family: 'Inter' } } } }, scales: currentChartType === 'bar' ? { y: { beginAtZero: true, grid: { color: gc }, ticks: { color: tc } }, x: { grid: { color: gc }, ticks: { color: tc, maxRotation: 45 } } } : {} } }; financeChartInstance = new Chart(cv, cfg); }

        function toggleCalculator() { const o = document.getElementById('calcOverlay'); o.classList.toggle('active'); if (o.classList.contains('active')) calcClear(); }
        function openReceiptPicker() {
            if (!currentUser) {
                showNotification('Entre na sua conta para inserir um comprovante.', 'error');
                return;
            }
            getReceiptOcrWorker().catch(error => console.warn('Pré-carregamento do OCR indisponível:', error));
            const input = document.getElementById('receiptUploadInput');
            input.value = '';
            input.click();
        }

        let selectedReceiptBlob = null;
        let receiptPreviewUrl = null;
        let receiptSaving = false;
        let receiptTransactionRef = null;
        let receiptTransactionCreated = false;
        let receiptAttachmentSaved = false;
        let receiptExtractedTime = null;

        function updateReceiptTypeLabels() {
            const type = document.querySelector('[name="receiptReviewType"]:checked')?.value;
            document.getElementById('receiptIncomeLabel').classList.toggle('selected-income', type === 'income');
            document.getElementById('receiptExpenseLabel').classList.toggle('selected-expense', type === 'expense');
        }

        function setReceiptPreview(blob) {
            if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
            receiptPreviewUrl = URL.createObjectURL(blob);
            const image = document.getElementById('receiptPreviewImage');
            const pdf = document.getElementById('receiptPreviewPdf');
            const placeholder = document.getElementById('receiptPreviewPlaceholder');
            const isPdf = blob.type === 'application/pdf';
            image.hidden = isPdf;
            pdf.hidden = !isPdf;
            placeholder.hidden = true;
            if (isPdf) pdf.src = receiptPreviewUrl;
            else image.src = receiptPreviewUrl;
        }

        function optimizeCanvasForOcr(ctx, width, height) {
            try {
                const imgData = ctx.getImageData(0, 0, width, height);
                const d = imgData.data;
                const len = d.length;

                // 1. Detectar se é captura em Modo Escuro (fundo escuro e letras claras em apps de banco)
                let sumLum = 0;
                let sampleCount = 0;
                for (let i = 0; i < len; i += 16) {
                    sumLum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
                    sampleCount++;
                }
                const avgLum = sumLum / Math.max(1, sampleCount);
                const isDarkMode = avgLum < 115;

                // 2. Passagem em pixels: escala de cinza, inversão de modo escuro e curva de contraste
                for (let i = 0; i < len; i += 4) {
                    let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    if (isDarkMode) {
                        lum = 255 - lum; // Inverte fundo escuro para texto preto sobre branco (ideal para Tesseract)
                    }
                    // Curva de contraste dinâmico: aprofunda texto escuro e limpa fundo
                    if (lum < 135) {
                        lum = Math.max(0, lum * 0.72 - 12);
                    } else if (lum > 165) {
                        lum = Math.min(255, lum * 1.15 + 15);
                    }
                    d[i] = lum;
                    d[i + 1] = lum;
                    d[i + 2] = lum;
                }
                ctx.putImageData(imgData, 0, 0);
            } catch (e) {
                console.warn('Otimização de pixels OCR ignorada:', e);
            }
        }

        function preprocessReceiptCanvas(source, width, height) {
            const maxDimension = 1400;
            const scale = Math.min(1.6, maxDimension / Math.max(width, height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const context = canvas.getContext('2d', { alpha: false });
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
            optimizeCanvasForOcr(context, canvas.width, canvas.height);
            return canvas;
        }

        async function compressImageForStorage(source, width, height, maxDimension = 1100) {
            const scale = Math.min(1, maxDimension / Math.max(width, height));
            const targetWidth = Math.max(1, Math.round(width * scale));
            const targetHeight = Math.max(1, Math.round(height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d', { alpha: false });
            // Preencher com branco para evitar fundo preto em PNGs/screenshots transparentes
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

            // Compressão direta JPEG ultra-rápida (gera ~45-75 KB instantaneamente em menos de 20ms)
            let quality = 0.68;
            let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
            if (blob && blob.size > 160 * 1024) {
                quality = 0.52;
                const smaller = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
                if (smaller) blob = smaller;
            }

            return { blob, canvas };
        }

        function createOcrCanvas(cleanCanvas) {
            // 1300px proporciona resolução nítida para caracteres pequenos e pontuações de datas
            const maxOcrDim = 1300;
            const scale = Math.min(1.5, maxOcrDim / Math.max(cleanCanvas.width, cleanCanvas.height));
            const ocrCanvas = document.createElement('canvas');
            ocrCanvas.width = Math.max(1, Math.round(cleanCanvas.width * scale));
            ocrCanvas.height = Math.max(1, Math.round(cleanCanvas.height * scale));
            const ctx = ocrCanvas.getContext('2d', { alpha: false });
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height);
            ctx.drawImage(cleanCanvas, 0, 0, ocrCanvas.width, ocrCanvas.height);
            optimizeCanvasForOcr(ctx, ocrCanvas.width, ocrCanvas.height);
            return ocrCanvas;
        }

        function canvasToJpegBlob(canvas) {
            return new Promise((resolve, reject) => {
                canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível otimizar a imagem.')), 'image/jpeg', 0.72);
            });
        }

        function blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        async function prepareReceiptForOcr(file) {
            if (file.type === 'application/pdf') {
                if (!window.pdfjsLib) throw new Error('O leitor de PDF não foi carregado. Recarregue a página e tente novamente.');
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
                if (pdf.numPages > 5) throw new Error('O PDF tem mais de 5 páginas. Envie apenas as páginas do comprovante.');
                const canvases = [];
                for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                    const page = await pdf.getPage(pageNumber);
                    const initialViewport = page.getViewport({ scale: 1 });
                    const scale = Math.min(1.8, 1800 / Math.max(initialViewport.width, initialViewport.height));
                    const viewport = page.getViewport({ scale });
                    const rendered = document.createElement('canvas');
                    rendered.width = Math.ceil(viewport.width);
                    rendered.height = Math.ceil(viewport.height);
                    await page.render({ canvasContext: rendered.getContext('2d'), viewport }).promise;
                    canvases.push(preprocessReceiptCanvas(rendered, rendered.width, rendered.height));
                    rendered.width = 0;
                    rendered.height = 0;
                }
                return { blob: file, canvases };
            }

            const bitmap = await createImageBitmap(file);
            if (bitmap.width * bitmap.height > 60000000) {
                bitmap.close();
                throw new Error('A imagem tem resolução muito alta. Reduza a imagem e tente novamente.');
            }
            const { blob, canvas } = await compressImageForStorage(bitmap, bitmap.width, bitmap.height, 1200);
            bitmap.close();
            const ocrCanvas = createOcrCanvas(canvas);
            return { blob, canvases: [ocrCanvas] };
        }

        let receiptOcrWorkerPromise = null;
        let receiptOcrProgressHandler = null;

        function setReceiptOcrProgress(percent, label) {
            const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
            document.getElementById('receiptProgressPercent').textContent = `${safePercent}%`;
            document.getElementById('receiptProgressFill').style.width = `${safePercent}%`;
            document.querySelector('.receipt-progress-track').setAttribute('aria-valuenow', String(safePercent));
            if (label) document.getElementById('receiptProgressLabel').textContent = label;
        }

        async function getReceiptOcrWorker() {
            if (!window.Tesseract) throw new Error('O mecanismo OCR não carregou. Verifique sua conexão e tente novamente.');
            if (!receiptOcrWorkerPromise) {
                receiptOcrWorkerPromise = Tesseract.createWorker('por', 1, {
                    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
                    logger: message => {
                        if (receiptOcrProgressHandler) receiptOcrProgressHandler(message);
                    }
                }).then(async worker => {
                    await worker.setParameters({
                        tessedit_pageseg_mode: '3',
                        preserve_interword_spaces: '1',
                        user_defined_dpi: '300'
                    });
                    return worker;
                }).catch(error => {
                    receiptOcrWorkerPromise = null;
                    throw error;
                });
            }
            return receiptOcrWorkerPromise;
        }

        async function recognizeReceiptCanvases(canvases) {
            let activePage = 0;
            const pageCount = canvases.length;
            receiptOcrProgressHandler = message => {
                const phase = message.status === 'recognizing text' ? 'Reconhecendo texto' : 'Carregando OCR em português';
                const localProgress = Number(message.progress) || 0;
                setReceiptOcrProgress(10 + ((activePage + localProgress) / pageCount) * 85, phase);
            };
            try {
                setReceiptOcrProgress(3, 'Carregando OCR em português…');
                const worker = await getReceiptOcrWorker();
                const textPages = [];
                for (activePage = 0; activePage < pageCount; activePage += 1) {
                    document.getElementById('receiptProgressLabel').textContent = pageCount > 1
                        ? `Lendo página ${activePage + 1} de ${pageCount}…`
                        : 'Lendo comprovante…';
                    const result = await worker.recognize(canvases[activePage]);
                    textPages.push(result.data.text || '');
                    setReceiptOcrProgress(10 + ((activePage + 1) / pageCount) * 85, 'Extraindo dados do texto…');
                }
                return textPages.join('\n');
            } finally {
                receiptOcrProgressHandler = null;
            }
        }

        function normalizeReceiptText(text) {
            return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\u00a0/g, ' ');
        }

        function parseBrazilianAmount(value) {
            let normalized = value.replace(/[^\d.,]/g, '');
            if (normalized.includes(',') && normalized.includes('.')) normalized = normalized.replace(/\./g, '').replace(',', '.');
            else if (normalized.includes(',')) normalized = normalized.replace(',', '.');
            else if ((normalized.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(normalized)) normalized = normalized.replace(/\./g, '');
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
        }

        function extractReceiptAmount(text) {
            const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            const expression = /(?:R\s?\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2}|\.\d{2})?)/gi;
            const candidates = [];
            lines.forEach((line, lineIndex) => {
                const normalizedLine = normalizeReceiptText(line);
                const excluded = /\b(cpf|cnpj|documento|autenticacao|autentica[cç][aã]o|protocolo|identificador|codigo|agencia|conta|saldo|limite|horario|hora)\b/.test(normalizedLine);
                expression.lastIndex = 0;
                for (const match of line.matchAll(expression)) {
                    const raw = match[1];
                    const hasCurrency = /R\s?\$/i.test(match[0]);
                    const hasCents = /[,.]\d{2}$/.test(raw);
                    if (excluded || (!hasCurrency && !hasCents)) continue;
                    const amount = parseBrazilianAmount(raw);
                    if (!amount || amount <= 0) continue;
                    let score = hasCurrency ? 6 : 2;
                    if (/\b(valor|total|pago|pagamento|recebido|recebimento|transferencia|pix|compra)\b/.test(normalizedLine)) score += 3;
                    if (/\b(taxa|tarifa|troco|desconto)\b/.test(normalizedLine)) score -= 2;
                    candidates.push({ amount, score, lineIndex });
                }
            });
            if (!candidates.length) return { value: null, confidence: 'baixa' };
            candidates.sort((a, b) => b.score - a.score || b.lineIndex - a.lineIndex);
            const top = candidates[0];
            const ambiguous = candidates.filter(candidate => candidate.score === top.score && candidate.amount !== top.amount).length > 0;
            return { value: top.amount, confidence: ambiguous ? 'baixa' : top.score >= 6 ? 'alta' : 'media' };
        }

        const RECEIPT_MONTHS = {
            // Português
            'jan': 1, 'janeiro': 1, 'fev': 2, 'fevereiro': 2, 'mar': 3, 'marco': 3, 'março': 3,
            'abr': 4, 'abril': 4, 'mai': 5, 'maio': 5, 'jun': 6, 'junho': 6,
            'jul': 7, 'julho': 7, 'ago': 8, 'agosto': 8, 'set': 9, 'setembro': 9,
            'out': 10, 'outubro': 10, 'nov': 11, 'novembro': 11, 'dez': 12, 'dezembro': 12,
            // Espanhol
            'ene': 1, 'enero': 1, 'feb': 2, 'febrero': 2, 'marzo': 3, 'may': 5, 'mayo': 5,
            'sep': 9, 'septiembre': 9, 'setiembre': 9, 'oct': 10, 'octubre': 10, 'noviembre': 11,
            'dic': 12, 'diciembre': 12,
            // Inglês
            'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
            'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
        };

        function sanitizeOcrDateStr(str) {
            return String(str || '')
                .replace(/[oO]/g, '0')
                .replace(/[lI|]/g, '1')
                .replace(/[sS]/g, '5')
                .replace(/[bB]/g, '8');
        }

        function parseReceiptDate(text) {
            const lines = text.split(/\r?\n/);
            const candidates = [];
            const now = new Date();
            const currentYear = now.getFullYear();

            const monthKeys = Object.keys(RECEIPT_MONTHS).sort((a, b) => b.length - a.length).join('|');
            const textualRegex = new RegExp(`\\b(\\d{1,2})\\s*(?:de|[/.-])\\s*(${monthKeys})\\s*(?:de|[/.-])?\\s*(\\d{2,4})\\b`, 'gi');
            const numericRegex = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/g;
            const noisyRegex = /\b([0-9oOlIsSbB]{1,2})[/.\-]([0-9oOlIsSbB]{1,2})[/.\-]([0-9oOlIsSbB]{2,4})\b/g;
            const isoRegex = /\b(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/g;

            function evaluateDate(day, month, rawYear, lineText, lineIndex, formatBonus = 0) {
                let year = Number(rawYear);
                if (year < 100) year += year < 80 ? 2000 : 1900;
                if (year < 2000 || year > 2040) return;
                if (month < 1 || month > 12 || day < 1 || day > 31) return;

                const parsedDate = new Date(Date.UTC(year, month - 1, day));
                if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) return;

                const normalizedLine = normalizeReceiptText(lineText);
                let score = 5 + formatBonus;

                // Bonificações contextuais fortes (data do pagamento/transação efetuada)
                if (/\b(data\s+do\s+pagamento|data\s+da\s+transac|efetuado\s+em|realizado\s+em|pago\s+em|debito\s+em|transacao\s+realizada|transferido\s+em|liquidado\s+em|pagamento\s+realizado)\b/.test(normalizedLine)) {
                    score += 18;
                } else if (/\b(data|data\s*\/hora|transacao|pagamento|operacao|autenticacao|efetivacao|horario)\b/.test(normalizedLine)) {
                    score += 8;
                }

                if (/\b(pix|ted|doc|comprovante|recibo|cupom)\b/.test(normalizedLine)) {
                    score += 4;
                }

                // Penalidade forte para termos que NÃO representam a data da transação (ex.: vencimento em boletos)
                if (/\b(vencimento|vence\s+em|data\s+do\s+vencimento|validade|nascimento|emissao|venc)\b/.test(normalizedLine)) {
                    score -= 18;
                }

                // Proximidade com ano atual
                if (year === currentYear) {
                    score += 4;
                } else if (Math.abs(year - currentYear) > 2) {
                    score -= 8;
                }

                // Penalidade se a data for no futuro distante (> 30 dias de hoje)
                const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
                const diffDays = (parsedDate.getTime() - todayUtc) / (1000 * 60 * 60 * 24);
                if (diffDays > 30) {
                    score -= 15;
                }

                const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                candidates.push({ value: isoStr, score, lineIndex });
            }

            lines.forEach((line, index) => {
                // 1. Textual: "17 de Outubro de 2026", "17 OUT 2026", "17/out/26"
                textualRegex.lastIndex = 0;
                let match;
                while ((match = textualRegex.exec(line)) !== null) {
                    const d = Number(match[1]);
                    const mName = match[2].toLowerCase();
                    const m = RECEIPT_MONTHS[mName];
                    if (m) evaluateDate(d, m, match[3], line, index, 10);
                }

                // 2. Numérico comum: "17/10/2026"
                numericRegex.lastIndex = 0;
                while ((match = numericRegex.exec(line)) !== null) {
                    evaluateDate(Number(match[1]), Number(match[2]), match[3], line, index, 6);
                }

                // 3. ISO: "2026-10-17"
                isoRegex.lastIndex = 0;
                while ((match = isoRegex.exec(line)) !== null) {
                    evaluateDate(Number(match[3]), Number(match[2]), match[1], line, index, 6);
                }

                // 4. Noisy OCR (caracteres confusos: l7/1O/2026)
                noisyRegex.lastIndex = 0;
                while ((match = noisyRegex.exec(line)) !== null) {
                    const cleanD = sanitizeOcrDateStr(match[1]);
                    const cleanM = sanitizeOcrDateStr(match[2]);
                    const cleanY = sanitizeOcrDateStr(match[3]);
                    if (/^\d{1,2}$/.test(cleanD) && /^\d{1,2}$/.test(cleanM) && /^\d{2,4}$/.test(cleanY)) {
                        evaluateDate(Number(cleanD), Number(cleanM), cleanY, line, index, 2);
                    }
                }
            });

            if (!candidates.length) {
                return { date: '', confidence: 'baixa', raw: null };
            }

            candidates.sort((a, b) => b.score - a.score || a.lineIndex - b.lineIndex);
            const best = candidates[0];
            const confidence = best.score >= 12 ? 'alta' : best.score >= 6 ? 'media' : 'baixa';
            return { date: best.value, confidence, raw: best };
        }

        function parseReceiptTime(text) {
            const timeRegex = /\b([01]?\d|2[0-3])[:hH]([0-5]\d)(?::([0-5]\d))?\b/g;
            const lines = text.split(/\r?\n/);
            const candidates = [];
            lines.forEach((line, index) => {
                const norm = normalizeReceiptText(line);
                let m;
                timeRegex.lastIndex = 0;
                while ((m = timeRegex.exec(line)) !== null) {
                    const h = String(m[1]).padStart(2, '0');
                    const min = String(m[2]).padStart(2, '0');
                    let score = 2;
                    if (/\b(horario|hora|as|transacao|pagamento|autenticacao|efetuado)\b/.test(norm)) score += 6;
                    candidates.push({ time: `${h}:${min}`, score, index });
                }
            });
            candidates.sort((a, b) => b.score - a.score || a.index - b.index);
            return candidates[0]?.time || null;
        }

        function detectReceiptType(text) {
            const norm = normalizeReceiptText(text);
            if (/\b(recebido|recebimento|pix recebido|transferencia recebida|credito em conta|remuneracao|salario|estorno recebido)\b/.test(norm)) {
                return 'income';
            }
            return 'expense';
        }

        function detectReceiptCategory(text, type) {
            const norm = normalizeReceiptText(text);
            if (type === 'income') {
                if (/\b(salario|folha|remuneracao|ordenado|holerite)\b/.test(norm)) return 'salario';
                if (/\b(freelance|servico prestado|honorario|bico)\b/.test(norm)) return 'freelance';
                if (/\b(rendimento|dividendo|juros|investimento|tesouro|cdb|acoes)\b/.test(norm)) return 'investimentos';
                return 'outros';
            }
            if (/\b(supermercado|mercado|carrefour|pao de acucar|assai|atacad|extra|dia|atacadao|mercearia|hortifruti|sacolao)\b/.test(norm)) return 'mercado';
            if (/\b(restaurante|lanchonete|padaria|ifood|uber eats|burg|lanches|mcdonald|pizza|pizzaria|bar|cafe|refeicao|chopp|choperia|cantina)\b/.test(norm)) return 'alimentacao';
            if (/\b(posto|combustivel|gasolina|etanol|alcool|diesel|ipiranga|shell|petrobras|br distribuidora|abastec)\b/.test(norm)) return 'combustivel';
            if (/\b(uber|99|99app|99pop|taxi|corrida|pedagio|sem parar|veloe|estacionamento|bilhete unico|metro|onibus)\b/.test(norm)) return 'transporte';
            if (/\b(farmacia|drogaria|droga raia|drogasil|pague menos|ultrafarma|hospital|medico|medica|clinica|dentista|odont|laboratorio|exame|consulta)\b/.test(norm)) return 'saude';
            if (/\b(aluguel|condominio|iptu|enel|copel|cemig|sabesp|sanepar|energia eletrica|luz|agua|gas|internet|claro|vivo|tim)\b/.test(norm)) return 'moradia';
            if (/\b(oficina|mecanic|auto pecas|pneu|pneus|balanceamento|alinhamento|troca de oleo|funilaria)\b/.test(norm)) return 'manutencao_veiculo';
            if (/\b(escola|faculdade|universidade|curso|colegio|matricula|mensalidade|educacao|livraria|apostila)\b/.test(norm)) return 'educacao';
            if (/\b(cinema|teatro|show|netflix|spotify|disney|prime video|steam|jogos|viagem|hotel|hospedagem|parque|lazer|ingressos)\b/.test(norm)) return 'lazer';
            return '';
        }

        function detectReceiptDescription(text) {
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const patterns = [
                /(?:para|favorecido|benefici[aá]rio|recebedor|destinat[aá]rio|nome|pago a|estabelecimento|empresa|razao social)\s*[:=-]?\s*([^\n\r,.;]{3,45})/i,
                /(?:loja|comercio|mercado|posto)\s+([^\n\r,.;]{3,35})/i
            ];
            for (const line of lines) {
                for (const pat of patterns) {
                    const match = line.match(pat);
                    if (match && match[1]) {
                        let name = match[1].trim();
                        name = name.replace(/\b(cpf|cnpj|instituicao|chave|banco|agencia|conta|valor|data).*$/i, '').trim();
                        if (name.length >= 3 && !/^(pix|comprovante|pagamento|transferencia|ted|doc)$/i.test(name)) {
                            return name.charAt(0).toUpperCase() + name.slice(1);
                        }
                    }
                }
            }
            return '';
        }

        function extractReceiptData(text) {
            const amount = extractReceiptAmount(text);
            const dateResult = parseReceiptDate(text);
            const extractedTime = parseReceiptTime(text);
            const detectedType = detectReceiptType(text);
            const detectedCategory = detectReceiptCategory(text, detectedType);
            const detectedDesc = detectReceiptDescription(text);

            return {
                valor: amount.value || 0,
                data: dateResult.date,
                dataConfidence: dateResult.confidence,
                time: extractedTime,
                type: detectedType,
                category: detectedCategory,
                description: detectedDesc,
                confianca_extracao: (amount.confidence === 'alta' && dateResult.confidence === 'alta') ? 'alta' : (amount.value && dateResult.date ? 'media' : 'baixa')
            };
        }

        function fillReceiptReview(receipt) {
            receiptExtractedTime = receipt.time || null;
            document.getElementById('receiptAmount').value = receipt.valor > 0 ? receipt.valor.toFixed(2) : '';

            // Fallback inteligente para a data de hoje caso OCR não localize data no comprovante
            const effectiveDate = receipt.data || (typeof getTodayInBrasiliaISO === 'function' ? getTodayInBrasiliaISO() : new Date().toISOString().split('T')[0]);
            document.getElementById('receiptDate').value = effectiveDate;

            document.getElementById('receiptDescription').value = receipt.description || '';
            document.getElementById('receiptCategory').value = receipt.category || '';

            // Marca o tipo detectado (despesa ou receita)
            const typeToSelect = receipt.type || 'expense';
            const radio = document.querySelector(`[name="receiptReviewType"][value="${typeToSelect}"]`);
            if (radio) radio.checked = true;
            updateReceiptTypeLabels();

            const confidence = document.getElementById('receiptConfidence');
            confidence.textContent = `Confiança ${receipt.confianca_extracao}`;
            confidence.hidden = false;

            const messages = [];
            if (receipt.data && receipt.valor > 0) {
                messages.push(`Data (${receipt.data}) e valor (R$ ${receipt.valor.toFixed(2)}) reconhecidos com sucesso!`);
            } else if (!receipt.data) {
                messages.push('Data sugerida como hoje (confira se coincide com o comprovante).');
            } else if (!receipt.valor) {
                messages.push('O valor não foi identificado com certeza; informe-o antes de salvar.');
            }

            if (receipt.time) {
                messages.push(`Horário identificado: ${receipt.time}.`);
            }
            if (receipt.description) {
                messages.push(`Favorecido sugerido: "${receipt.description}".`);
            }
            if (receipt.category) {
                messages.push('Categoria pré-selecionada automaticamente.');
            } else {
                messages.push('Selecione a categoria adequada.');
            }

            const messageEl = document.getElementById('receiptAnalysisMessage');
            messageEl.textContent = messages.join(' ');
            messageEl.hidden = messages.length === 0;
            document.getElementById('receiptReviewForm').hidden = false;
            document.getElementById('receiptManualEntryButton').hidden = true;
        }

        function enableManualReceiptEntry() {
            document.getElementById('receiptAnalysisError').hidden = true;
            document.getElementById('receiptAnalysisMessage').textContent = 'Preencha os dados manualmente e confira o comprovante antes de salvar.';
            document.getElementById('receiptAnalysisMessage').hidden = false;
            document.getElementById('receiptAmount').value = '';
            document.getElementById('receiptDate').value = '';
            document.getElementById('receiptDescription').value = '';
            document.getElementById('receiptCategory').value = '';
            document.getElementById('receiptConfidence').hidden = true;
            document.querySelectorAll('[name="receiptReviewType"]').forEach(input => { input.checked = false; });
            updateReceiptTypeLabels();
            document.getElementById('receiptReviewForm').hidden = false;
            document.getElementById('receiptManualEntryButton').hidden = true;
            document.getElementById('receiptAmount').focus();
        }

        async function handleReceiptFileSelection(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            if (!currentUser) {
                showNotification('Entre na sua conta para inserir um comprovante.', 'error');
                event.target.value = '';
                return;
            }
            if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
                showNotification('Selecione uma imagem ou arquivo PDF.', 'error');
                event.target.value = '';
                return;
            }
            if (file.size > 12 * 1024 * 1024) {
                showNotification('O comprovante deve ter no máximo 12 MB antes da otimização.', 'error');
                event.target.value = '';
                return;
            }
            selectedReceiptBlob = null;
            if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
            receiptPreviewUrl = null;
            document.getElementById('receiptPreviewImage').src = '';
            document.getElementById('receiptPreviewImage').hidden = true;
            document.getElementById('receiptPreviewPdf').src = 'about:blank';
            document.getElementById('receiptPreviewPdf').hidden = true;
            document.getElementById('receiptPreviewPlaceholder').hidden = false;
            document.getElementById('receiptFileName').textContent = file.name;
            document.getElementById('receiptAnalysisMessage').hidden = true;
            document.getElementById('receiptAnalysisError').hidden = true;
            document.getElementById('receiptReviewForm').hidden = true;
            document.getElementById('receiptManualEntryButton').hidden = false;
            document.getElementById('receiptManualEntryButton').textContent = 'Pular leitura e preencher agora';
            document.getElementById('receiptLoading').hidden = false;
            document.getElementById('receiptReviewModal').classList.add('active');

            try {
                setReceiptOcrProgress(0, 'Preparando comprovante…');
                const prepared = await prepareReceiptForOcr(file);
                selectedReceiptBlob = prepared.blob;
                if (selectedReceiptBlob.size > 4 * 1024 * 1024) {
                    throw new Error('O comprovante excede 4 MB. Escolha uma imagem menor ou reduza o PDF.');
                }
                const optKb = Math.round(selectedReceiptBlob.size / 1024);
                const reduction = Math.max(0, Math.round((1 - selectedReceiptBlob.size / file.size) * 100));
                const badge = reduction > 5 ? `${optKb} KB (-${reduction}% compactado)` : `${optKb} KB otimizado`;
                document.getElementById('receiptFileName').textContent = `${file.name} • ${badge}`;
                setReceiptPreview(selectedReceiptBlob);

                const ocrTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('A leitura automática demorou. Você pode preencher os campos diretamente.')), 9000));
                const rawText = await Promise.race([recognizeReceiptCanvases(prepared.canvases), ocrTimeout]);

                if (normalizeReceiptText(rawText).replace(/[^a-z0-9]/g, '').length < 4) {
                    throw new Error('Não foi possível reconhecer texto nítido. Tente outra foto ou preencha os dados manualmente.');
                }
                fillReceiptReview(extractReceiptData(rawText));
                setReceiptOcrProgress(100, 'Leitura concluída. Confira os campos.');
            } catch (error) {
                console.warn('OCR não completou ou foi pulado:', error);
                document.getElementById('receiptAnalysisError').textContent = error.message || 'Não foi possível analisar o comprovante.';
                document.getElementById('receiptAnalysisError').hidden = false;
                document.getElementById('receiptManualEntryButton').hidden = false;
                document.getElementById('receiptManualEntryButton').textContent = 'Preencher manualmente';
            } finally {
                document.getElementById('receiptLoading').hidden = true;
            }
        }

        async function receiveSharedReceiptFromUrl() {
            const url = new URL(window.location.href);
            const shareId = url.searchParams.get('sharedReceipt');
            const shareError = url.searchParams.get('sharedReceiptError');
            if (shareError) {
                const messages = {
                    unsupported: 'O arquivo compartilhado precisa ser uma imagem ou PDF.',
                    'too-large': 'O arquivo compartilhado excede 12 MB.',
                    unavailable: 'Não foi possível receber o arquivo compartilhado. Tente usar o botão + do app.'
                };
                showNotification(messages[shareError] || messages.unavailable, 'error');
            }
            if (!shareId && !shareError) return;

            url.searchParams.delete('sharedReceipt');
            url.searchParams.delete('sharedReceiptError');
            history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
            if (!shareId) return;

            try {
                const cache = await caches.open('finance-shared-receipts-v1');
                const cacheUrl = new URL(`__shared_receipts__/${encodeURIComponent(shareId)}`, new URL('./', window.location.href));
                const response = await cache.match(cacheUrl);
                if (!response) throw new Error('O arquivo compartilhado expirou. Compartilhe-o novamente.');

                const blob = await response.blob();
                await cache.delete(cacheUrl);
                let fileName = response.headers.get('X-Shared-File-Name') || 'comprovante';
                try { fileName = decodeURIComponent(fileName); } catch (_) { fileName = 'comprovante'; }
                pendingSharedReceiptFile = new File([blob], fileName, {
                    type: response.headers.get('Content-Type') || blob.type
                });
                if (currentUser) processPendingSharedReceipt();
            } catch (error) {
                console.error('Erro ao recuperar comprovante compartilhado:', error);
                showNotification(error.message || 'Não foi possível recuperar o comprovante compartilhado.', 'error');
            }
        }

        function processPendingSharedReceipt() {
            if (!currentUser || !pendingSharedReceiptFile) return;
            const file = pendingSharedReceiptFile;
            pendingSharedReceiptFile = null;
            handleReceiptFileSelection({ target: { files: [file], value: '' } });
        }

        document.addEventListener('DOMContentLoaded', () => {
            receiveSharedReceiptFromUrl();
        });

        async function confirmReceipt() {
            if (receiptSaving) return;
            if (!currentUser) {
                showNotification('Sua sessão expirou. Entre novamente para salvar.', 'error');
                return;
            }
            const form = document.getElementById('receiptReviewForm');
            if (!receiptTransactionCreated) {
                if (!form.reportValidity()) return;
                const type = document.querySelector('[name="receiptReviewType"]:checked')?.value;
                const value = Number(document.getElementById('receiptAmount').value);
                const date = document.getElementById('receiptDate').value;
                const description = document.getElementById('receiptDescription').value.trim();
                const category = document.getElementById('receiptCategory').value;
                if (!['income', 'expense'].includes(type) || !Number.isFinite(value) || value <= 0 || !date || !category || description.length > 100) {
                    showNotification('Confira tipo, valor, data e categoria antes de salvar.', 'error');
                    return;
                }
            }

            receiptSaving = true;
            const confirmBtn = document.getElementById('receiptConfirmButton');
            const cancelBtn = document.getElementById('receiptCancelButton');
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Salvando lançamento…';
            document.getElementById('receiptSaveStatus').hidden = false;
            document.getElementById('receiptSaveStatus').textContent = 'Salvando lançamento…';
            document.getElementById('receiptAnalysisError').hidden = true;

            try {
                if (!selectedReceiptBlob) throw new Error('O comprovante não está disponível. Selecione-o novamente.');
                
                const type = document.querySelector('[name="receiptReviewType"]:checked').value;
                const value = Number(document.getElementById('receiptAmount').value);
                const date = document.getElementById('receiptDate').value;
                const description = document.getElementById('receiptDescription').value.trim();
                const category = document.getElementById('receiptCategory').value;

                if (!receiptTransactionRef) {
                    receiptTransactionRef = db.collection('transactions').doc();
                }
                const now = new Date();
                const extension = selectedReceiptBlob.type === 'application/pdf' ? 'pdf' : 'jpg';

                // Comprovantes compactados (<= 450 KB): salva de imediato no Firestore junto à transação em UMA única chamada (< 300ms)
                const isDirectBase64Safe = selectedReceiptBlob.size <= 450 * 1024;
                let base64Attachment = null;
                if (isDirectBase64Safe) {
                    base64Attachment = await blobToBase64(selectedReceiptBlob);
                }

                const transactionPayload = {
                    userId: currentUser.uid,
                    type,
                    date,
                    time: receiptExtractedTime || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                    value: Number(value.toFixed(2)),
                    category,
                    description: escapeHtml(description),
                    favorite: false,
                    createdAt: now.toISOString(),
                    deleted: false
                };

                if (base64Attachment) {
                    transactionPayload.receiptBase64 = base64Attachment;
                }

                // 1. Grava no Firestore (instantâneo)
                await receiptTransactionRef.set(transactionPayload, { merge: true });
                receiptTransactionCreated = true;
                receiptAttachmentSaved = true;

                // 2. Se anexado diretamente, conclui IMEDIATAMENTE a UI sem fazer o usuário esperar
                if (base64Attachment) {
                    showNotification('Transação e comprovante salvos com sucesso!', 'success');
                    const targetTxRef = receiptTransactionRef;
                    const savedBlob = selectedReceiptBlob;
                    closeReceiptReview(true);
                    if (typeof performSearch === 'function') performSearch();
                    try { updateAllViews(); } catch (e) { }

                    // 3. Em segundo plano (sem travar a tela), sincroniza com Firebase Storage
                    (async () => {
                        try {
                            const uploadedRef = storage.ref(`receipts/${currentUser.uid}/${targetTxRef.id}.${extension}`);
                            const uploadPromise = uploadedRef.put(savedBlob, { contentType: savedBlob.type });
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout')), 3500));
                            await Promise.race([uploadPromise, timeoutPromise]);
                            await targetTxRef.update({
                                receiptPath: uploadedRef.fullPath,
                                receiptBase64: firebase.firestore.FieldValue.delete()
                            });
                            console.log('Comprovante sincronizado com sucesso no Firebase Storage em segundo plano.');
                        } catch (bgErr) {
                            console.warn('Storage em segundo plano indisponível (CORS ou rede). Comprovante mantido com segurança no Firestore:', bgErr);
                        }
                    })();
                    return;
                }

                // Caso seja arquivo grande (> 450 KB), envia ao Storage com timeout ágil
                document.getElementById('receiptSaveStatus').textContent = 'Lançamento salvo! Enviando anexo…';
                confirmBtn.textContent = 'Enviando anexo…';
                let uploadSuccessful = false;
                try {
                    const uploadedRef = storage.ref(`receipts/${currentUser.uid}/${receiptTransactionRef.id}.${extension}`);
                    const uploadPromise = uploadedRef.put(selectedReceiptBlob, { contentType: selectedReceiptBlob.type });
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Storage upload timeout')), 4000));
                    await Promise.race([uploadPromise, timeoutPromise]);
                    await receiptTransactionRef.update({ receiptPath: uploadedRef.fullPath });
                    uploadSuccessful = true;
                } catch (storageErr) {
                    console.warn('Falha no upload para o Firebase Storage:', storageErr);
                }

                if (uploadSuccessful) {
                    showNotification('Transação e comprovante salvos com sucesso!', 'success');
                    closeReceiptReview(true);
                    if (typeof performSearch === 'function') performSearch();
                    try { updateAllViews(); } catch (e) { }
                } else {
                    document.getElementById('receiptAnalysisError').innerHTML =
                        '<strong>O lançamento foi salvo com sucesso!</strong><br>' +
                        'Porém, o anexo excedeu o limite ou o Storage bloqueou o envio.<br>' +
                        '<small>O lançamento já está registrado no seu extrato.</small>';
                    document.getElementById('receiptAnalysisError').hidden = false;
                    document.getElementById('receiptSaveStatus').textContent = 'Lançamento salvo no app. Anexo do comprovante pendente.';
                    confirmBtn.textContent = 'Tentar reenviar comprovante';
                    cancelBtn.textContent = 'Concluir sem comprovante';
                    cancelBtn.onclick = () => closeReceiptReview(true);
                    showNotification('Lançamento salvo! Anexo pendente.', 'warning');
                }
            } catch (error) {
                console.error('Erro ao salvar a transação do comprovante:', error);
                if (receiptTransactionCreated) {
                    document.getElementById('receiptAnalysisError').textContent = 'O lançamento foi salvo, mas houve erro no anexo: ' + (error.message || error);
                    document.getElementById('receiptAnalysisError').hidden = false;
                    confirmBtn.textContent = 'Tentar reenviar comprovante';
                    cancelBtn.textContent = 'Concluir sem comprovante';
                    cancelBtn.onclick = () => closeReceiptReview(true);
                    showNotification('Lançamento salvo; comprovante pendente.', 'warning');
                } else {
                    showNotification(error.message || 'Não foi possível salvar a transação no Firestore.', 'error');
                }
            } finally {
                receiptSaving = false;
                confirmBtn.disabled = false;
                document.getElementById('receiptSaveStatus').hidden = !receiptTransactionCreated || receiptAttachmentSaved;
            }
        }

        function closeReceiptReview(force = false) {
            if (receiptSaving && !force) return;
            if (receiptTransactionCreated && !receiptAttachmentSaved && !force && !confirm('A transação já está salva, mas o comprovante ainda não foi anexado. Fechar mesmo assim?')) return;
            document.getElementById('receiptReviewModal').classList.remove('active');
            document.getElementById('receiptUploadInput').value = '';
            if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
            receiptPreviewUrl = null;
            selectedReceiptFile = null;
            selectedReceiptBlob = null;
            receiptTransactionRef = null;
            receiptTransactionCreated = false;
            receiptAttachmentSaved = false;
            receiptExtractedTime = null;
            document.getElementById('receiptConfirmButton').textContent = 'Confirmar e salvar';
            const closeButton = document.getElementById('receiptCancelButton');
            closeButton.textContent = 'Cancelar';
            closeButton.onclick = () => closeReceiptReview();
            document.getElementById('receiptSaveStatus').textContent = 'Salvando lançamento e comprovante…';
            document.getElementById('receiptAnalysisError').hidden = true;
            document.getElementById('receiptReviewForm').querySelectorAll('input, select').forEach(input => { input.disabled = false; });
            document.getElementById('receiptPreviewImage').src = '';
            document.getElementById('receiptPreviewPdf').src = 'about:blank';
            try { updateAllViews(); } catch (e) { }
        }
        let calcDisplayStr = '0'; let calcPrev = null; let calcOp = null; const CALC_MAX_DIGITS = 10;
        function countDigits(s) { return (s.match(/\d/g) || []).length; }
        function calcUpdateDisplay() { document.getElementById('calcDisplay').value = calcDisplayStr; }
        function calcInput(key) { const symMap = { '+': '+', '-': '\u2212', '*': '\u00D7', '/': '/' }; const opRegex = /([+\-\u2212\u00D7/])/; if (key === '\u00B1') { if (calcOp) { const p = calcDisplayStr.split(opRegex).filter(Boolean); if (p[2]) { p[2] = String(-parseFloat(p[2])); calcDisplayStr = p.join(''); } } else { calcDisplayStr = String(-parseFloat(calcDisplayStr)); } } else if (key === '%') { if (calcOp) { const p = calcDisplayStr.split(opRegex); const l = p[p.length - 1]; if (l && l !== '-' && l !== '+') { p[p.length - 1] = String(parseFloat(l) / 100); calcDisplayStr = p.join(''); } } else { calcDisplayStr = String(parseFloat(calcDisplayStr) / 100); } } else if (key === '.') { const p = calcDisplayStr.split(opRegex); const ln = p[p.length - 1] || ''; if (!ln.includes('.') && countDigits(calcDisplayStr) < CALC_MAX_DIGITS) { if (ln === '' || ln === '0') p[p.length - 1] = '0.'; else p[p.length - 1] = ln + '.'; calcDisplayStr = p.join(''); } } else if ('0123456789'.includes(key)) { const p = calcDisplayStr.split(opRegex); const lp = p[p.length - 1] || '0'; const dl = (lp.match(/\d/g) || []).length; if (dl >= CALC_MAX_DIGITS && !lp.includes('.')) return; if (lp === '0' && key !== '0' && !lp.includes('.')) p[p.length - 1] = key; else p[p.length - 1] = lp + key; calcDisplayStr = p.join(''); } else if ('+-*/'.includes(key)) { const sym = symMap[key]; if (calcOp && calcPrev !== null) { const p = calcDisplayStr.split(opRegex); const l = p[p.length - 1]; if (l && l !== '-' && l !== '+' && !isNaN(parseFloat(l))) { calcEquals(); calcDisplayStr = calcDisplayStr + sym; calcPrev = parseFloat(calcDisplayStr); calcOp = key; } else { calcPrev = parseFloat(calcDisplayStr.replace(/([+\-\u2212\u00D7/])$/, '').trim() || 0); calcOp = key; calcDisplayStr = (calcDisplayStr.replace(/([+\-\u2212\u00D7/])$/, '').trim() || '0') + sym; } } else { calcPrev = parseFloat(calcDisplayStr.replace(/([+\-\u2212\u00D7/])$/, '').trim() || 0); calcOp = key; calcDisplayStr = (calcDisplayStr.replace(/([+\-\u2212\u00D7/])$/, '').trim() || '0') + sym; } } calcUpdateDisplay(); }
        function calcClear() { calcDisplayStr = '0'; calcPrev = null; calcOp = null; calcUpdateDisplay(); }
        function calcBackspace() {
            if (calcDisplayStr.length > 1) {
                calcDisplayStr = calcDisplayStr.slice(0, -1);
                if (calcDisplayStr === '-') calcDisplayStr = '0';
            } else {
                calcDisplayStr = '0';
            }
            calcUpdateDisplay();
        }
        function calcEquals() { var de = document.getElementById('calcDisplay'); var s = (de && de.value) ? de.value : calcDisplayStr; if (!s || s === '') return; var nm = String(s).replace(/\u00D7/g, '*').replace(/\u2212/g, '-').trim(); var p = nm.split(/([+\-*/])/); if (p.length < 3) return; var a = parseFloat(p[0]); var op = p[1]; var b = parseFloat(p[2]); if (isNaN(a)) return; if (isNaN(b)) b = 0; var r; if (op === '+') r = a + b; else if (op === '-') r = a - b; else if (op === '*') r = a * b; else if (op === '/') r = b === 0 ? 0 : a / b; else return; r = Math.round(r * 1e10) / 1e10; calcDisplayStr = String(r).length > CALC_MAX_DIGITS ? String(Number(r).toExponential(6)) : String(r); calcPrev = null; calcOp = null; calcUpdateDisplay(); }

        /* --- New Transaction Type & Value Logic --- */
        // let currentTransactionType = 'income'; // DUPLICADO DESATIVADO
        function setTransactionType_OLD(type) {
            currentTransactionType = type;
            const ti = document.getElementById('toggleIncome');
            const te = document.getElementById('toggleExpense');
            const ri = document.getElementById('radioIncome');
            const re = document.getElementById('radioExpense');
            const vd = document.getElementById('transactionValue');
            if (type === 'income') {
                ti.classList.remove('inactive');
                te.classList.add('inactive');
                ri.classList.add('filled');
                re.classList.remove('filled');
                vd.classList.remove('expense-color');
            } else {
                ti.classList.add('inactive');
                te.classList.remove('inactive');
                ri.classList.remove('filled');
                re.classList.add('filled');
                vd.classList.add('expense-color');
            }
        }
        function saveNewTransaction_OLD() {
            addTransaction(currentTransactionType);
        }

        function updateDatePillText() {
            var di = document.getElementById('transactionDate');
            var dt = document.getElementById('datePillText');
            if (!di || !dt) return;
            if (!di.value) { dt.textContent = ''; return; }
            
            const today = new Date();
            const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
            
            const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
            const yestStr = yest.getFullYear() + '-' + String(yest.getMonth()+1).padStart(2,'0') + '-' + String(yest.getDate()).padStart(2,'0');
            
            const tom = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            const tomStr = tom.getFullYear() + '-' + String(tom.getMonth()+1).padStart(2,'0') + '-' + String(tom.getDate()).padStart(2,'0');
            
            const valStr = di.value;
            var lang = (typeof currentLang !== 'undefined' ? currentLang : null) || localStorage.getItem('lang') || 'pt-BR';
            var todayLabel = lang === 'en' ? 'TODAY' : (lang === 'es' ? 'HOY' : 'HOJE');
            var yestLabel = lang === 'en' ? 'YESTERDAY' : (lang === 'es' ? 'AYER' : 'ONTEM');
            var tomLabel = lang === 'en' ? 'TOMORROW' : (lang === 'es' ? 'MAÑANA' : 'AMANHÃ');

            var monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
            if (lang === 'en') {
                monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            } else if (lang === 'es') {
                monthNames = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
            }

            if (valStr === todayStr) {
                dt.textContent = todayLabel;
            } else if (valStr === yestStr) {
                dt.textContent = yestLabel;
            } else if (valStr === tomStr) {
                dt.textContent = tomLabel;
            } else {
                const parts = valStr.split('-');
                const d = new Date(valStr + 'T00:00:00Z');
                if (lang === 'en') {
                    dt.textContent = monthNames[d.getUTCMonth()] + ' ' + d.getUTCDate();
                } else {
                    dt.textContent = d.getUTCDate() + ' ' + monthNames[d.getUTCMonth()] + '.';
                }
            }
        }
        function updateDateDisplayText() { updateDatePillText(); }
        const tdEl = document.getElementById('transactionDate');
        if (tdEl) tdEl.addEventListener('change', function () { updateDailyTransactions(); updateDatePillText(); });

        let customCalDate = new Date();
        function openCustomDateModal() {
            const di = document.getElementById('transactionDate');
            if(di && di.value){
                customCalDate = new Date(di.value + 'T00:00:00Z');
            } else {
                customCalDate = new Date();
            }
            renderCustomCal();
            const modal = document.getElementById('customDateModal');
            if(modal) modal.classList.add('active');
        }

        function closeCustomDateModal() {
            const modal = document.getElementById('customDateModal');
            if(modal) modal.classList.remove('active');
        }

        function changeCustomCalMonth(offset) {
            customCalDate.setUTCMonth(customCalDate.getUTCMonth() + offset);
            renderCustomCal();
        }

        function selectTodayCustomCal() {
            const today = new Date();
            const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
            const di = document.getElementById('transactionDate');
            if(di) di.value = todayStr;
            updateDailyTransactions();
            updateDatePillText();
            closeCustomDateModal();
        }

        function renderCustomCal() {
            const year = customCalDate.getUTCFullYear();
            const month = customCalDate.getUTCMonth();
            
            var lang = (typeof currentLang !== 'undefined' ? currentLang : null) || localStorage.getItem('lang') || 'pt-BR';
            let monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
            if (lang === 'en') {
                monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
            } else if (lang === 'es') {
                monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
            }
            const monthSpan = document.getElementById('customCalMonthYear');
            if(monthSpan) monthSpan.textContent = monthNames[month] + (year !== new Date().getFullYear() ? " " + year : "");

            const grid = document.getElementById('customCalDays');
            if(!grid) return;
            grid.innerHTML = '';

            const firstDay = new Date(Date.UTC(year, month, 1));
            const lastDay = new Date(Date.UTC(year, month + 1, 0));
            const startingDayOfWeek = firstDay.getUTCDay();
            const prevMonthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

            const di = document.getElementById('transactionDate');
            let selectedStr = '';
            if(di && di.value) selectedStr = di.value;

            for(let i = startingDayOfWeek - 1; i >= 0; i--) {
                const btn = document.createElement('button');
                btn.className = 'custom-cal-day other-month';
                btn.textContent = prevMonthLastDay - i;
                grid.appendChild(btn);
            }

            for(let i = 1; i <= lastDay.getUTCDate(); i++) {
                const btn = document.createElement('button');
                btn.className = 'custom-cal-day';
                btn.textContent = i;
                
                const cellStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(i).padStart(2,'0');
                if(cellStr === selectedStr) btn.classList.add('selected');

                btn.onclick = () => {
                    if(di) di.value = cellStr;
                    updateDailyTransactions();
                    updateDatePillText();
                    closeCustomDateModal();
                };
                grid.appendChild(btn);
            }

            const totalCells = startingDayOfWeek + lastDay.getUTCDate();
            let nextDays = 1;
            for(let i = totalCells; i < 42; i++) {
                if (i >= 35 && startingDayOfWeek + lastDay.getUTCDate() <= 35) break;
                const btn = document.createElement('button');
                btn.className = 'custom-cal-day other-month';
                btn.textContent = nextDays++;
                grid.appendChild(btn);
            }
        }

        var _origPrevDay = previousDay;
        previousDay = function () { _origPrevDay(); updateDatePillText(); };
        var _origNextDay = nextDay;
        nextDay = function () { _origNextDay(); updateDatePillText(); };
        document.addEventListener('click', e => { if (e.target.classList.contains('modal-overlay')) { const mid = e.target.id; if (mid === 'monthPickerModal') closeMonthPickerModal(); else closeModal(mid); } });
        function previousDay() { const di = document.getElementById('transactionDate'); const cd = new Date(di.value + 'T00:00:00Z'); cd.setUTCDate(cd.getUTCDate() - 1); di.value = cd.toISOString().split('T')[0]; updateDailyTransactions(); }
        function nextDay() { const di = document.getElementById('transactionDate'); const cd = new Date(di.value + 'T00:00:00Z'); cd.setUTCDate(cd.getUTCDate() + 1); di.value = cd.toISOString().split('T')[0]; updateDailyTransactions(); }
        // ==================== CONTAS FIXAS ====================
        // contasFixas, cfBalance, cfBalanceSavedAt, editingContaFixaId are initialized at top of file

        const CF_MOTIVATIONAL_MESSAGES = [
            { icon: '🚀', text: 'Você está no controle! Continue assim e suas finanças vão decolar!' },
            { icon: '💪', text: 'Cada conta paga é um passo em direção à sua liberdade financeira!' },
            { icon: '🌟', text: 'Incrível! Você está gerenciando suas contas com excelência.' },
            { icon: '🎯', text: 'Foco total! Quitar suas contas fixas é a base de uma vida financeira saudável.' },
            { icon: '🏆', text: 'Campeão do orçamento! Suas contas fixas estão sob controle.' },
            { icon: '🌱', text: 'Pequenos pagamentos constantes constroem uma vida financeira sólida. Você está no caminho certo!' },
            { icon: '✨', text: 'Sua dedicação em pagar as contas em dia é inspiradora! Continue brilhando.' },
            { icon: '💎', text: 'Disciplina financeira é o segredo dos bem-sucedidos. E você tem isso!' },
            { icon: '🔥', text: 'Você está em chamas! Mantenha esse ritmo e as finanças serão suas aliadas.' },
            { icon: '🌈', text: 'Cada conta quitada abre espaço para realizar seus sonhos. Vai em frente!' }
        ];

        function cfGetRandomMessage() {
            return CF_MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * CF_MOTIVATIONAL_MESSAGES.length)];
        }

        // Load balance: try localStorage first (instant), then Firestore updates via listener
        function cfLoadBalance() {
            if (!currentUser) { cfBalance = 0; cfBalanceSavedAt = null; return; }
            const localVal = parseFloat(localStorage.getItem('cfBalance_' + currentUser.uid) || '0') || 0;
            cfBalance = localVal;
            cfBalanceSavedAt = localStorage.getItem('cfBalanceSavedAt_' + currentUser.uid) || null;
            const inp = document.getElementById('cfBalanceInput');
            if (inp && localVal > 0) inp.value = localVal;
        }

        function cfToggleBalanceEdit() {
            const row = document.getElementById('cfBalanceEditRow');
            const btn = document.querySelector('.cf-edit-bal-btn');
            if (!row) return;
            const isOpen = row.style.display !== 'none';
            row.style.display = isOpen ? 'none' : 'flex';
            if (btn) btn.classList.toggle('active', !isOpen);
            if (!isOpen) {
                const inp = document.getElementById('cfBalanceInput');
                if (inp) { inp.value = cfBalance || ''; inp.focus(); }
            }
        }

        function cfSaveBalance() {
            if (!currentUser) { showNotification('Faça login para salvar', 'error'); return; }
            const inp = document.getElementById('cfBalanceInput');
            const v = parseFloat(inp.value) || 0;
            if (v < 0) { showNotification('O saldo não pode ser negativo!', 'error'); return; }
            cfBalance = v;
            const savedAt = new Date().toISOString();
            cfBalanceSavedAt = savedAt;
            // Save to localStorage immediately (cache)
            localStorage.setItem('cfBalance_' + currentUser.uid, v);
            localStorage.setItem('cfBalanceSavedAt_' + currentUser.uid, savedAt);
            // Save to Firestore (sync across devices)
            db.collection('userSettings').doc(currentUser.uid).set({
                userId: currentUser.uid,
                cfBalance: v,
                cfBalanceSavedAt: savedAt,
                updatedAt: savedAt
            }, { merge: true })
                .then(() => {
                    showNotification('Saldo salvo na nuvem! ✅', 'success');
                    inp.value = '';
                    // Close edit row
                    const row = document.getElementById('cfBalanceEditRow');
                    const btn = document.querySelector('.cf-edit-bal-btn');
                    if (row) row.style.display = 'none';
                    if (btn) btn.classList.remove('active');
                    cfUpdateViews();
                })
                .catch(err => {
                    console.error('Erro ao salvar saldo:', err);
                    showNotification('Saldo salvo localmente (sem conexão).', 'warning');
                    cfUpdateViews();
                });
        }

        let unsubscribeUserSettings = null;

        function cfSetupFirestoreListener(user) {
            // Listener for contasFixas
            if (unsubscribeContasFixas) unsubscribeContasFixas();
            unsubscribeContasFixas = db.collection('contasFixas')
                .where('userId', '==', user.uid)
                .onSnapshot(snapshot => {
                    contasFixas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    cfUpdateViews();
                }, err => {
                    if (err && String(err).includes('ERR_BLOCKED_BY_CLIENT')) return;
                    console.warn('Aviso contasFixas listener:', err && err.message ? err.message : err);
                });

            // Real-time listener for user balance (userSettings)
            if (unsubscribeUserSettings) unsubscribeUserSettings();
            unsubscribeUserSettings = db.collection('userSettings').doc(user.uid)
                .onSnapshot(doc => {
                    if (doc.exists && doc.data().cfBalance !== undefined) {
                        const data = doc.data();
                        const remoteBalance = parseFloat(data.cfBalance) || 0;
                        const remoteSavedAt = data.cfBalanceSavedAt || null;
                        cfBalance = remoteBalance;
                        cfBalanceSavedAt = remoteSavedAt;
                        // Update localStorage cache
                        localStorage.setItem('cfBalance_' + user.uid, remoteBalance);
                        if (remoteSavedAt) localStorage.setItem('cfBalanceSavedAt_' + user.uid, remoteSavedAt);
                        
                        if (data.cfNotificationsEnabled !== undefined) {
                            const tog = document.getElementById('cfNotifToggleModal');
                            const opt = document.getElementById('cfNotifOptionsModal');
                            const btn = document.getElementById('cfNotifBtn');
                            if(tog) {
                                tog.checked = data.cfNotificationsEnabled;
                                if (opt) {
                                    opt.style.display = data.cfNotificationsEnabled ? 'flex' : 'none';
                                }
                                if (btn) {
                                    if(data.cfNotificationsEnabled) btn.classList.add('active');
                                    else btn.classList.remove('active');
                                }
                            }
                        }
                        if (data.cfNotifMode !== undefined) {
                            const mod = document.getElementById('cfNotifModeModal');
                            if(mod) mod.value = data.cfNotifMode;
                        }
                        if (data.cfNotifTime !== undefined) {
                            const tim = document.getElementById('cfNotifTimeModal');
                            if(tim) tim.value = data.cfNotifTime;
                        }
                        
                        // Update input field if visible
                        const inp = document.getElementById('cfBalanceInput');
                        if (inp && document.getElementById('cfBalanceEditRow')?.style.display !== 'none') inp.value = remoteBalance;
                        cfUpdateViews();
                    }
                }, err => {
                    if (err && String(err).includes('ERR_BLOCKED_BY_CLIENT')) return;
                    console.warn('Aviso userSettings listener:', err && err.message ? err.message : err);
                });
        }

        // Hook into the existing auth state change to also setup CF listener
        const _origSetupListeners = setupFirestoreListeners;
        setupFirestoreListeners = function (user) {
            _origSetupListeners(user);
            cfSetupFirestoreListener(user);
            cfLoadBalance();
        };

        function showAddContaFixaModal() {
            editingContaFixaId = null;
            document.getElementById('cfModalTitle').textContent = 'Nova Conta Fixa';
            document.getElementById('addContaFixaForm').reset();
            document.getElementById('cfBillDueDay').value = 10;
            document.getElementById('cfBillMonth').value = '';
            showModal('addContaFixaModal');
        }

        function editContaFixa(id) {
            const cf = contasFixas.find(c => c.id === id);
            if (!cf) return;
            editingContaFixaId = id;
            document.getElementById('cfModalTitle').textContent = 'Editar Conta Fixa';
            document.getElementById('cfBillName').value = cf.name;
            document.getElementById('cfBillValue').value = cf.value;
            document.getElementById('cfBillCategory').value = cf.category || '📦';
            document.getElementById('cfBillDueDay').value = cf.dueDay || 10;
            
            let monthVal = '';
            if(cf.dueMonth && cf.dueYear) {
                monthVal = `${cf.dueYear}-${String(cf.dueMonth).padStart(2,'0')}`;
            }
            document.getElementById('cfBillMonth').value = monthVal;
            
            showModal('addContaFixaModal');
        }

        function saveContaFixa() {
            if (!currentUser) { showNotification('Faça login para salvar', 'error'); return; }
            const name = document.getElementById('cfBillName').value.trim();
            const value = parseFloat(document.getElementById('cfBillValue').value);
            const category = document.getElementById('cfBillCategory').value;
            const dueDay = parseInt(document.getElementById('cfBillDueDay').value) || 10;
            const monthVal = document.getElementById('cfBillMonth').value;
            
            // Enhanced validation
            if (!name || !value || value <= 0) { 
                showNotification('Preencha nome e valor corretamente!', 'error'); 
                return; 
            }
            
            if (name.length < 2 || name.length > 100) {
                showNotification('Nome deve ter entre 2 e 100 caracteres', 'error');
                return;
            }
            
            if (value > 999999.99) {
                showNotification('Valor não pode exceder 999.999,99', 'error');
                return;
            }
            
            if (dueDay < 1 || dueDay > 31) {
                showNotification('Dia do vencimento inválido (1-31)', 'error');
                return;
            }

            const data = {
                userId: currentUser.uid,
                name: escapeHtml(name), value, category, dueDay,
                paid: false,
                isInstallment: false,
                createdAt: new Date().toISOString()
            };
            
            if(monthVal) {
                const [y, m] = monthVal.split('-');
                data.dueYear = parseInt(y);
                data.dueMonth = parseInt(m);
            } else {
                data.dueYear = null;
                data.dueMonth = null;
            }

            if (editingContaFixaId) {
                db.collection('contasFixas').doc(editingContaFixaId).update({ name: escapeHtml(name), value, category, dueDay, dueYear: data.dueYear, dueMonth: data.dueMonth })
                    .then(() => { showNotification('Conta atualizada!', 'success'); closeModal('addContaFixaModal'); })
                    .catch(e => console.error(e));
            } else {
                db.collection('contasFixas').add(data)
                    .then(() => { showNotification('Conta fixa adicionada!', 'success'); closeModal('addContaFixaModal'); })
                    .catch(e => console.error(e));
            }
        }

        // --- Lógica de Contas Parceladas ---
        function showAddContaParceladaModal() {
            document.getElementById('cpModalTitle').textContent = 'Nova Conta Parcelada';
            document.getElementById('addContaParceladaForm').reset();
            document.getElementById('cpBillFirstDate').value = getTodayInBrasiliaISO();
            document.getElementById('cpPreviewContainer').style.display = 'none';
            document.getElementById('btnSaveCp').disabled = true;
            document.getElementById('cpPreviewList').innerHTML = '';
            showModal('addContaParceladaModal');
        }

        function generateInstallmentsPreview() {
            const name = document.getElementById('cpBillName').value.trim();
            const totalStr = document.getElementById('cpBillTotal').value;
            const plotsStr = document.getElementById('cpBillInstallments').value;
            const startDateStr = document.getElementById('cpBillFirstDate').value;
            
            if(!name || !totalStr || !plotsStr || !startDateStr) {
                showNotification('Preencha todos os campos.', 'error');
                return;
            }
            
            const totalValue = parseFloat(totalStr);
            const plots = parseInt(plotsStr);
            if(totalValue <= 0 || plots < 2) {
                showNotification('O valor deve ser maior que zero e número de parcelas > 1.', 'error');
                return;
            }
            
            let valuePerPlot = Math.floor((totalValue / plots) * 100) / 100;
            let firstPlotValue = totalValue - (valuePerPlot * (plots - 1));
            firstPlotValue = Math.round(firstPlotValue * 100) / 100;
            
            const listDiv = document.getElementById('cpPreviewList');
            let html = '';
            
            const [y, m, d] = startDateStr.split('-');
            let baseDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
            
            for(let i = 1; i <= plots; i++){
                let plotValue = (i === 1) ? firstPlotValue : valuePerPlot;
                
                let plotDate = new Date(baseDate.getTime());
                plotDate.setMonth(plotDate.getMonth() + (i - 1));
                
                let pdY = plotDate.getFullYear();
                let pdM = String(plotDate.getMonth() + 1).padStart(2, '0');
                let pdD = String(plotDate.getDate()).padStart(2, '0');
                let dateInputVal = `${pdY}-${pdM}-${pdD}`;
                
                let uniqueId = 'preview_' + i;
                
                html += `
                <div class="cp-preview-item">
                    <div>
                        <input type="text" id="${uniqueId}_name" class="form-input" value="${escapeHtml(name)} (${i}/${plots})" style="padding:0.4rem; font-size:0.85rem;">
                    </div>
                    <div style="width:90px;">
                        <input type="number" id="${uniqueId}_val" class="form-input" step="0.01" min="0" value="${plotValue.toFixed(2)}" style="padding:0.4rem; font-size:0.85rem;">
                    </div>
                    <div style="width:130px;">
                        <input type="date" id="${uniqueId}_date" class="form-input" value="${dateInputVal}" style="padding:0.4rem; font-size:0.85rem;">
                    </div>
                </div>`;
            }
            listDiv.innerHTML = html;
            document.getElementById('cpPreviewContainer').style.display = 'flex';
            document.getElementById('btnSaveCp').disabled = false;
        }

        function saveContaParcelada() {
            if (!currentUser) { showNotification('Faça login para salvar', 'error'); return; }
            
            const category = document.getElementById('cpBillCategory').value;
            const plots = parseInt(document.getElementById('cpBillInstallments').value);
            
            // Validate plots
            if (plots < 2 || plots > 360) {
                showNotification('Número de parcelas deve estar entre 2 e 360', 'error');
                return;
            }
            
            let parcelas = [];
            let groupId = 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            for(let i = 1; i <= plots; i++){
                let uniqueId = 'preview_' + i;
                let iptName = document.getElementById(`${uniqueId}_name`);
                let iptVal = document.getElementById(`${uniqueId}_val`);
                let iptDate = document.getElementById(`${uniqueId}_date`);
                
                if(!iptName || !iptVal || !iptDate) continue;
                
                let plotName = iptName.value.trim();
                let plotVal = parseFloat(iptVal.value);
                let plotDate = iptDate.value; // yyyy-mm-dd
                
                if(!plotName || !plotVal || !plotDate) {
                    showNotification('Preencha os dados de todas as parcelas.', 'error');
                    return;
                }
                
                // Enhanced validation for each installment
                if (plotName.length < 2 || plotName.length > 100) {
                    showNotification('Nome de parcela deve ter entre 2 e 100 caracteres', 'error');
                    return;
                }
                
                if (plotVal <= 0 || plotVal > 999999.99) {
                    showNotification('Valor de parcela deve estar entre 0,01 e 999.999,99', 'error');
                    return;
                }
                
                let [y, m, d] = plotDate.split('-');
                
                parcelas.push({
                    userId: currentUser.uid,
                    name: escapeHtml(plotName),
                    value: parseFloat(plotVal.toFixed(2)),
                    category: category,
                    dueDay: parseInt(d),
                    dueMonth: parseInt(m),
                    dueYear: parseInt(y),
                    isInstallment: true,
                    installmentGroup: groupId,
                    installmentIndex: i,
                    installmentTotal: plots,
                    fullDate: plotDate,
                    paid: false,
                    createdAt: new Date().toISOString()
                });
            }
            
            if(parcelas.length === 0) return;
            
            const batch = db.batch();
            parcelas.forEach(p => {
                const docRef = db.collection('contasFixas').doc();
                batch.set(docRef, p);
            });
            
            batch.commit()
                .then(() => {
                    showNotification(parcelas.length + ' parcelas adicionadas!', 'success');
                    closeModal('addContaParceladaModal');
                })
                .catch(e => {
                    console.error('Erro ao salvar parcelas:', e);
                    showNotification('Erro ao salvar parcelas: ' + (e.message || 'desconhecido'), 'error');
                });
        }
        // --- Fim Lógica Contas Parceladas ---

        function cfTogglePaid(id) {
            const cf = contasFixas.find(c => c.id === id);
            if (!cf) return;
            db.collection('contasFixas').doc(id).update({ paid: !cf.paid })
                .catch(e => console.error(e));
        }

        function deleteContaFixa(id) {
            const cf = contasFixas.find(c => c.id === id);
            if (!cf) return;
            if (confirm('Mover "' + cf.name + '" para a lixeira?')) {
                // Store in trash via localStorage (same mechanism as transactions)
                const trashItem = {
                    id: 'cf_' + id,
                    type: 'expense',
                    description: cf.name + ' (Conta Fixa)',
                    value: cf.value,
                    category: cf.category,
                    date: getTodayInBrasiliaISO(),
                    deletedAt: new Date().toISOString(),
                    isCF: true,
                    cfId: id
                };
                // Add to localStorage trash
                const trash = getTrashFromStorage();
                trash.push(trashItem);
                saveTrashToStorage(trash);
                // Delete from Firestore
                db.collection('contasFixas').doc(id).delete()
                    .then(() => {
                        showNotification('Movido para a lixeira.', 'success');
                        updateTrashList();
                    })
                    .catch(e => console.error(e));
            }
        }

        function cfUpdateViews() {
            const allActiveBills = contasFixas.filter(c => !c.deleted);
            const activeBills = allActiveBills.filter(c => !c.isInstallment && !c.dueMonth);
            const activeInstallments = allActiveBills.filter(c => c.isInstallment || c.dueMonth);

            const now = new Date();
            const currYear = now.getFullYear();
            const currMonth = now.getMonth() + 1;
            
            // Only consider installments for progress/totals if they are from past or current months
            const applicableInstallments = activeInstallments.filter(c => {
                if(!c.dueYear || !c.dueMonth) return true;
                if(c.dueYear < currYear) return true;
                if(c.dueYear === currYear && c.dueMonth <= currMonth) return true;
                return false;
            });

            // For calculations
            const calcBills = [...activeBills, ...applicableInstallments];
            
            const totalBills = calcBills.reduce((s, c) => s + (c.value || 0), 0);
            const paidTotal = calcBills.filter(c => c.paid).reduce((s, c) => s + (c.value || 0), 0);
            const remaining = Math.max(totalBills - paidTotal, 0);
            const pct = totalBills > 0 ? Math.min((paidTotal / totalBills) * 100, 100) : 0;

            // --- Net of transactions created AFTER the balance was saved ---
            let netTransactions = 0;
            if (cfBalanceSavedAt) {
                const cutoff = cfBalanceSavedAt; // ISO string for comparison
                const txAfterSave = getActiveTransactions().filter(tx => {
                    const txTime = tx.createdAt || (tx.date ? tx.date + 'T00:00:00.000Z' : null);
                    return txTime && txTime >= cutoff;
                });
                const totalIncome = txAfterSave.filter(tx => tx.type === 'income').reduce((s, tx) => s + (tx.value || 0), 0);
                const totalExpense = txAfterSave.filter(tx => tx.type === 'expense').reduce((s, tx) => s + (tx.value || 0), 0);
                netTransactions = totalIncome - totalExpense;
            }

            // effectiveBalance = base balance + net of transactions added after the snapshot
            const effectiveBalance = cfBalance + netTransactions;
            const afterBills = effectiveBalance - remaining;

            const balDisplay = document.getElementById('cfBalanceDisplay');
            const balSub = document.getElementById('cfBalanceDisplaySub');
            const remDisplay = document.getElementById('cfRemainingDisplay');
            const remSub = document.getElementById('cfRemainingSubtitle');
            const diffDisplay = document.getElementById('cfDifferenceDisplay');
            const diffSub = document.getElementById('cfDifferenceSubtitle');
            const progFill = document.getElementById('cfProgressFill');
            const progPct = document.getElementById('cfProgressPct');
            const motIcon = document.getElementById('cfMotivational')?.querySelector('.cf-motivational-icon');
            const motText = document.getElementById('cfMotivationalText');

            if (balDisplay) balDisplay.textContent = formatCurrency(effectiveBalance);

            // Show breakdown only when there are transactions
            if (balSub) {
                if (cfBalance === 0) {
                    balSub.textContent = 'Insira seu saldo acima';
                } else if (netTransactions === 0) {
                    balSub.textContent = 'Base: ' + formatCurrency(cfBalance);
                } else {
                    const netLabel = netTransactions >= 0
                        ? '+' + formatCurrency(netTransactions) + ' em ganhos'
                        : formatCurrency(netTransactions) + ' em gastos';
                    balSub.textContent = 'Base ' + formatCurrency(cfBalance) + ' • ' + netLabel;
                }
            }

            if (remDisplay) remDisplay.textContent = formatCurrency(remaining);
            if (remSub) {
                if (remaining <= 0 && totalBills > 0) {
                    remSub.textContent = '✅ Todas as contas pagas!';
                } else if (totalBills === 0) {
                    remSub.textContent = 'Nenhuma conta cadastrada';
                } else {
                    const afterStr = afterBills >= 0
                        ? 'sobram ' + formatCurrency(afterBills)
                        : 'faltam ' + formatCurrency(Math.abs(afterBills));
                    remSub.textContent = afterStr + ' após pagar tudo';
                }
            }
            
            // Update difference card
            if (diffDisplay) {
                if (afterBills >= 0) {
                    diffDisplay.textContent = formatCurrency(afterBills);
                    diffDisplay.style.color = 'var(--primary-light)';
                } else {
                    diffDisplay.textContent = formatCurrency(Math.abs(afterBills));
                    diffDisplay.style.color = 'var(--danger-light)';
                }
            }
            if (diffSub) {
                if (totalBills === 0) {
                    diffSub.textContent = 'nenhuma conta';
                } else if (afterBills >= 0) {
                    diffSub.textContent = 'sobram após pagar';
                } else {
                    diffSub.textContent = 'faltam para pagar';
                }
            }

            if (progFill) progFill.style.width = pct.toFixed(1) + '%';
            if (progPct) progPct.textContent = pct.toFixed(0) + '% pago';

            // Motivational message
            const msg = cfGetRandomMessage();
            if (motIcon) motIcon.textContent = msg.icon;
            if (motText) {
                if (totalBills === 0) {
                    motText.textContent = 'Cadastre suas contas fixas e mantenha o controle financeiro!';
                } else if (pct >= 100) {
                    motText.textContent = '🎉 Parabéns! Você pagou TODAS as suas contas fixas este mês! Que conquista incrível!';
                } else {
                    motText.textContent = msg.text;
                }
            }

            // Render bills list
            cfRenderBills(activeBills, activeInstallments);
            
            // Scheduling
            if (document.getElementById('cfNotifToggle')?.checked) {
                scheduleBillsNotifications();
            }
        }

        function cfRenderBills(fixas, parceladas) {
            const listFixas = document.getElementById('cfBillsList');
            const listParceladas = document.getElementById('cpBillsList');
            
            if (listFixas) {
                if (fixas.length === 0) {
                    listFixas.innerHTML = '<div class="empty-state">Nenhuma conta fixa cadastrada</div>';
                } else {
                    const sortedFixas = [...fixas].sort((a, b) => {
                        if (a.paid !== b.paid) return a.paid ? 1 : -1;
                        return (a.dueDay || 99) - (b.dueDay || 99);
                    });
                    listFixas.innerHTML = sortedFixas.map(cfRenderItemHtml).join('');
                }
            }
            
            if (listParceladas) {
                if (parceladas.length === 0) {
                    listParceladas.innerHTML = '<div class="empty-state">Nenhuma conta parcelada cadastrada</div>';
                } else {
                    // Inject style for grouping if not present
                    if (!document.getElementById('cp-group-style')) {
                        const style = document.createElement('style');
                        style.id = 'cp-group-style';
                        style.textContent = `
                            .cp-month-group summary::-webkit-details-marker { display: none; }
                            .cp-month-group summary { list-style: none; }
                            .cp-month-group[open] summary .summary-chevron { transform: rotate(180deg); }
                            .cp-month-group .cf-bill-item:last-child { border-bottom: none; }
                        `;
                        document.head.appendChild(style);
                    }

                    // Sort by year, month, day
                    const sortedParc = [...parceladas].sort((a, b) => {
                        if (a.dueYear !== b.dueYear) return (a.dueYear || 9999) - (b.dueYear || 9999);
                        if (a.dueMonth !== b.dueMonth) return (a.dueMonth || 12) - (b.dueMonth || 12);
                        return (a.dueDay || 99) - (b.dueDay || 99);
                    });
                    
                    // Group by Month/Year
                    const grouped = {};
                    sortedParc.forEach(cf => {
                        const mYearStr = `${String(cf.dueMonth||1).padStart(2,'0')}/${cf.dueYear||new Date().getFullYear()}`;
                        if (!grouped[mYearStr]) grouped[mYearStr] = [];
                        grouped[mYearStr].push(cf);
                    });

                    var lang = (typeof currentLang !== 'undefined' ? currentLang : null) || localStorage.getItem('lang') || 'pt-BR';
                    let monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                    if (lang === 'en') {
                        monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                    } else if (lang === 'es') {
                        monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                    }
                    
                    let html = '';
                    const nowY = new Date().getFullYear();
                    const nowM = new Date().getMonth() + 1;

                    Object.keys(grouped).forEach(k => {
                        const [m, y] = k.split('/');
                        const monthName = monthNames[parseInt(m)-1];
                        const mTotal = grouped[k].reduce((acc, curr) => acc + (curr.value || 0), 0);
                        const mStr = `${monthName} ${y}`;
                        
                        let isFuture = false;
                        const thisY = parseInt(y);
                        const thisM = parseInt(m);
                        if (thisY > nowY || (thisY === nowY && thisM > nowM)) {
                            isFuture = true;
                        }
                        const openAttr = isFuture ? '' : 'open';

                        html += `
                        <details class="cp-month-group" ${openAttr} style="margin-bottom:1rem; border:1px solid rgba(0,0,0,0.1); border-radius:12px; overflow:hidden;">
                            <summary style="display:flex; justify-content:space-between; align-items:center; padding:1rem; cursor:pointer; background:rgba(0,0,0,0.03); font-weight:600; outline:none; user-select:none;">
                                <div style="display:flex; align-items:center; gap:0.5rem; text-transform:capitalize;">
                                    <svg class="summary-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition: transform 0.2s;">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                    ${mStr}
                                </div>
                                <div style="color:var(--text-color); font-size:1rem; opacity:0.9;">Total: ${formatCurrency(mTotal)}</div>
                            </summary>
                            <div style="padding:0.5rem 1rem 1rem 1rem; border-top:1px solid rgba(0,0,0,0.05);">
                                ${grouped[k].map(cfRenderItemHtml).join('')}
                            </div>
                        </details>`;
                    });

                    listParceladas.innerHTML = html;
                }
            }
        }

        function cfRenderItemHtml(cf) {
            const paidClass = cf.paid ? ' paid' : '';
            const checkedClass = cf.paid ? ' checked' : '';
            let dateLabel = `Vence dia ${cf.dueDay || '?'}`;
            let installmentLabel = '';
            
            if (cf.isInstallment && cf.dueMonth && cf.dueYear) {
                dateLabel = `Vence em ${String(cf.dueDay).padStart(2,'0')}/${String(cf.dueMonth).padStart(2,'0')}/${cf.dueYear}`;
                if (cf.installmentIndex && cf.installmentTotal) {
                    installmentLabel = ` • ${cf.installmentIndex}/${cf.installmentTotal}`;
                }
            }
            
            return `<div class="cf-bill-item${paidClass}">
                <button class="cf-bill-check${checkedClass}" onclick="cfTogglePaid('${cf.id}')" title="${cf.paid ? 'Marcar como não paga' : 'Marcar como paga'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20,6 9,17 4,12"/>
                    </svg>
                </button>
                <div class="cf-bill-info">
                    <div class="cf-bill-name">${cf.category || '📦'} ${escapeHtml(cf.name)}</div>
                    <div class="cf-bill-meta">${dateLabel}${installmentLabel} &bullet; ${cf.paid ? '✅ Paga' : '⏳ Pendente'}</div>
                </div>
                <div class="cf-bill-amount">${formatCurrency(cf.value)}</div>
                <div class="transaction-actions">
                    <button class="action-btn edit" onclick="editContaFixa('${cf.id}')" title="Editar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="action-btn delete" onclick="deleteContaFixa('${cf.id}', ${cf.isInstallment})" title="Excluir">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>`;
        }

        // Show contas-fixas tab should also refresh views
        const _origShowTab = showTab;
        showTab = function (tabName, el) {
            _origShowTab(tabName, el);
            if (tabName === 'contas-fixas') {
                cfLoadBalance();
                cfUpdateViews();
            }
            // Close menu when clicking "Sobre"
            if (tabName === 'sobre') {
                closeMenu();
            }
        };
        
        function showNotificationSettingsModal() {
            showModal('notificationSettingsModal');
        }
        
        let notificationsSupported = 'Notification' in window && 'serviceWorker' in navigator;

        function toggleCfNotifications(cb) {
            if (!currentUser) return;
            const opt = document.getElementById('cfNotifOptionsModal');
            const btn = document.getElementById('cfNotifBtn');
            if (cb.checked) {
                if (!notificationsSupported) {
                    showNotification('Seu navegador não suporta notificações de app.', 'error');
                    cb.checked = false;
                    return;
                }
                Notification.requestPermission().then(perm => {
                    if (perm === 'granted') {
                        saveNotifPref(true);
                        if (opt) opt.style.display = 'flex';
                        if (btn) btn.classList.add('active');
                        scheduleBillsNotifications();
                        showNotification('Lembretes ativados!', 'success');
                    } else {
                        cb.checked = false;
                        showNotification('Permissão negada.', 'warning');
                    }
                });
            } else {
                if (opt) opt.style.display = 'none';
                if (btn) btn.classList.remove('active');
                saveNotifPref(false);
            }
        }
        
        function updateCfNotifSettings() {
            saveNotifPref(true);
            scheduleBillsNotifications();
        }
        
        async function testNotification() {
            if (!notificationsSupported || Notification.permission !== 'granted') {
                showNotification('Ative os alertas no interruptor primeiro!', 'warning');
                return;
            }
            try {
                const reg = await navigator.serviceWorker.ready;
                reg.showNotification('Teste Funcional 🔔', {
                    body: 'Seu sistema de avisos de Contas Fixas está operante.',
                    icon: './assets/icons/icon-192.png',
                    tag: 'cf_test_' + Date.now()
                });
            } catch(e) {
                console.error('Erro ao enviar aviso teste', e);
            }
        }
        
        function saveNotifPref(enabled) {
            if (!currentUser) return;
            const mode = document.getElementById('cfNotifModeModal')?.value || 'both';
            const time = document.getElementById('cfNotifTimeModal')?.value || '09:00';
            db.collection('userSettings').doc(currentUser.uid).set({ 
                cfNotificationsEnabled: enabled,
                cfNotifMode: mode,
                cfNotifTime: time
            }, { merge: true }).catch(()=>{});
        }

        async function scheduleBillsNotifications() {
            if (!notificationsSupported || Notification.permission !== 'granted') return;
            if (!('showTrigger' in Notification.prototype)) {
                // Silently return since we assume it isn't supported completely on iOS Safari etc.
                return;
            }
            
            try {
                const reg = await navigator.serviceWorker.ready;
                
                const now = new Date();
                const currYear = now.getFullYear();
                const currMonth = now.getMonth() + 1;
                
                contasFixas.forEach(cf => {
                    if (cf.deleted || cf.paid) return; // Ignora pagas
                    
                const nMode = document.getElementById('cfNotifModeModal')?.value || 'both';
                const nTime = document.getElementById('cfNotifTimeModal')?.value || '09:00';
                const [nHr, nMin] = nTime.split(':').map(Number);
                    
                    let targetDate;
                    if (cf.isInstallment && cf.dueYear && cf.dueMonth) {
                        if (cf.dueYear < currYear || (cf.dueYear === currYear && cf.dueMonth < currMonth)) return; 
                        targetDate = new Date(cf.dueYear, cf.dueMonth - 1, cf.dueDay || 10, nHr, nMin, 0);
                    } else if(cf.dueYear && cf.dueMonth) {
                        // Fixed but single month
                        if (cf.dueYear < currYear || (cf.dueYear === currYear && cf.dueMonth < currMonth)) return; 
                        targetDate = new Date(cf.dueYear, cf.dueMonth - 1, cf.dueDay || 10, nHr, nMin, 0);
                    } else {
                        // Eternal recurring bills, schedule for current month or next
                        targetDate = new Date(currYear, currMonth - 1, cf.dueDay || 10, nHr, nMin, 0);
                        if (targetDate < now) {
                            targetDate.setMonth(targetDate.getMonth() + 1);
                        }
                    }
                    
                    const dayBefore = new Date(targetDate.getTime());
                    dayBefore.setDate(dayBefore.getDate() - 1);
                    
                    // Agenda véspera
                    if (dayBefore > now && (nMode === 'both' || nMode === 'prev')) {
                        reg.showNotification(`Vencimento Amanhã: ${cf.name}`, {
                            body: `Sua conta no valor de ${formatCurrency(cf.value)} vence amanhã!`,
                            icon: './assets/icons/icon-192.png',
                            tag: `cf_${cf.id}_vesp_${targetDate.getTime()}`,
                            showTrigger: new TimestampTrigger(dayBefore.getTime())
                        });
                    }
                    
                    // Agenda dia
                    if (targetDate > now && (nMode === 'both' || nMode === 'day')) {
                        reg.showNotification(`Vence Hoje: ${cf.name}`, {
                            body: `Não esqueça de pagar sua conta de ${formatCurrency(cf.value)} hoje às ${nTime}.`,
                            icon: './assets/icons/icon-192.png',
                            tag: `cf_${cf.id}_hoje_${targetDate.getTime()}`,
                            showTrigger: new TimestampTrigger(targetDate.getTime())
                        });
                    }
                });
            } catch(e) {
                console.error('Erro ao agendar notificações Locais:', e);
            }
        }

        let searchDebounceTimer = null;
        let transactionFilterTimer = null;
        function scheduleTransactionFilter() {
            clearTimeout(transactionFilterTimer);
            transactionFilterTimer = setTimeout(updateTransactionsList, 120);
        }

        function scheduleSearch() {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(performSearch, 120);
        }

        function normalizeFilterText(value) {
            return String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        }

        function performSearch() {
            const query = normalizeFilterText(document.getElementById('searchDescription').value);
            const terms = query.split(/\s+/).filter(Boolean);
            const startDate = document.getElementById('searchStartDate').value;
            const endDate = document.getElementById('searchEndDate').value;
            const type = document.getElementById('searchType').value;
            const favoritesOnly = document.getElementById('searchFavorites').checked;
            const matches = getActiveTransactions().filter(tx => {
                const searchable = normalizeFilterText(`${tx.description} ${getCategoryLabel(tx.category)}`);
                return terms.every(term => searchable.includes(term)) &&
                    (!selectedSearchCategories.size || selectedSearchCategories.has(tx.category)) &&
                    (!type || tx.type === type) &&
                    (!startDate || tx.date >= startDate) &&
                    (!endDate || tx.date <= endDate) &&
                    (!favoritesOnly || tx.favorite);
            });
            matches.sort((a, b) => b.date.localeCompare(a.date) || String(b.time || '').localeCompare(String(a.time || '')));
            lastSearchResults = matches;
            updateSearchResults(matches);
            updateSearchCategoryUI();
        }

        function clearSearch() {
            document.getElementById('searchDescription').value = '';
            document.getElementById('searchType').value = '';
            document.getElementById('searchFavorites').checked = false;
            document.getElementById('searchStartDate').value = '';
            document.getElementById('searchEndDate').value = '';
            selectedSearchCategories.clear();
            selectedMonths.clear();
            clearQuickDateBtns();
            updateSearchCategoryUI();
            performSearch();
        }

        function updateTransactionsList() {
            const list = document.getElementById('transactionsList');
            const query = normalizeFilterText(document.getElementById('transactionsQuery')?.value);
            const type = document.getElementById('transactionsType')?.value || '';
            const month = document.getElementById('transactionsMonth')?.value || '';
            const filtered = getActiveTransactions().filter(tx => {
                const searchable = normalizeFilterText(`${tx.description} ${getCategoryLabel(tx.category)}`);
                return (!query || searchable.includes(query)) && (!type || tx.type === type) && (!month || tx.date.startsWith(month));
            }).sort((a, b) => b.date.localeCompare(a.date) || String(b.time || '').localeCompare(String(a.time || '')));
            const count = document.getElementById('transactionsFilterCount');
            if (count) count.textContent = `${filtered.length} de ${getActiveTransactions().length} lançamentos`;
            if (!filtered.length) {
                list.innerHTML = `<div class="empty-state">${getActiveTransactions().length ? 'Nenhum lançamento corresponde aos filtros.' : t('noTransactionsFoundShort')}</div>`;
                return;
            }
            list.innerHTML = filtered.map(tx => renderTransactionItem(tx)).join('');
        }

        function clearTransactionFilters() {
            document.getElementById('transactionsQuery').value = '';
            document.getElementById('transactionsType').value = '';
            document.getElementById('transactionsMonth').value = '';
            updateTransactionsList();
        }

        function setChartType() {
            currentChartType = 'bar';
            updateChart();
        }

        function getChartData() {
            const period = document.getElementById('chartPeriod').value;
            const today = getTodayInBrasiliaISO();
            let startDate;
            let endDate;
            if (period === 'custom') {
                startDate = document.getElementById('chartStartDate').value;
                endDate = document.getElementById('chartEndDate').value;
                if (!startDate || !endDate || startDate > endDate) return { labels: [], income: [], expense: [], transactions: [] };
            } else if (period === 'month') {
                const month = document.getElementById('chartMonth').value;
                if (!month) return { labels: [], income: [], expense: [], transactions: [] };
                startDate = `${month}-01`;
                const [year, monthNumber] = month.split('-').map(Number);
                endDate = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`;
            } else if (period === 'week') {
                const week = document.getElementById('chartWeek').value;
                if (!week) return { labels: [], income: [], expense: [], transactions: [] };
                const [year, weekNumber] = week.split('-W').map(Number);
                const firstDay = new Date(Date.UTC(year, 0, 1 + (weekNumber - 1) * 7));
                const weekday = firstDay.getUTCDay() || 7;
                firstDay.setUTCDate(firstDay.getUTCDate() - weekday + 1);
                const lastDay = new Date(firstDay);
                lastDay.setUTCDate(lastDay.getUTCDate() + 6);
                startDate = firstDay.toISOString().slice(0, 10);
                endDate = lastDay.toISOString().slice(0, 10);
            } else if (period === 'year') {
                const year = document.getElementById('chartYear').value;
                if (!year) return { labels: [], income: [], expense: [], transactions: [] };
                startDate = `${year}-01-01`;
                endDate = `${year}-12-31`;
            } else {
                const start = new Date(`${today}T12:00:00`);
                start.setMonth(start.getMonth() - (period === 'last6' ? 6 : 3));
                startDate = start.toISOString().slice(0, 10);
                endDate = today;
            }

            let list = getActiveTransactions().filter(tx => tx.date >= startDate && tx.date <= endDate);
            const type = document.getElementById('chartTypeFilter').value;
            if (type !== 'both') list = list.filter(tx => tx.type === type);
            const favorites = document.getElementById('chartFavorites').value;
            if (favorites === 'favorites') list = list.filter(tx => tx.favorite);
            if (favorites === 'nonfavorites') list = list.filter(tx => !tx.favorite);
            if (selectedChartCategories.size) list = list.filter(tx => selectedChartCategories.has(tx.category));

            const grouped = new Map();
            list.forEach(tx => {
                const key = document.getElementById('chartGroupBy').value === 'date' ? tx.date : tx.category;
                if (!grouped.has(key)) grouped.set(key, { income: 0, expense: 0 });
                grouped.get(key)[tx.type] += Number(tx.value) || 0;
            });
            const keys = Array.from(grouped.keys()).sort((a, b) => {
                if (document.getElementById('chartGroupBy').value === 'date') return a.localeCompare(b);
                const totalA = grouped.get(a).income + grouped.get(a).expense;
                const totalB = grouped.get(b).income + grouped.get(b).expense;
                return totalB - totalA;
            });
            const currency = value => formatCurrency(value);
            const totalIncome = list.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + (Number(tx.value) || 0), 0);
            const totalExpense = list.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + (Number(tx.value) || 0), 0);
            return {
                labels: keys.map(key => document.getElementById('chartGroupBy').value === 'date' ? formatDateForDisplay(key) : getCategoryLabel(key)),
                income: keys.map(key => grouped.get(key).income),
                expense: keys.map(key => grouped.get(key).expense),
                transactions: list,
                totalIncome,
                totalExpense,
                currency
            };
        }

        function updateChart() {
            const canvas = document.getElementById('financeChart');
            if (!canvas) return;
            const data = getChartData();
            const empty = document.getElementById('chartEmptyState');
            const hasData = data.labels.length > 0;
            canvas.style.display = hasData ? 'block' : 'none';
            if (empty) empty.style.display = hasData ? 'none' : 'block';
            document.getElementById('chartTotalIncome').textContent = formatCurrency(data.totalIncome || 0);
            document.getElementById('chartTotalExpense').textContent = formatCurrency(data.totalExpense || 0);
            document.getElementById('chartTotalBalance').textContent = formatCurrency((data.totalIncome || 0) - (data.totalExpense || 0));
            document.getElementById('chartTransactionCount').textContent = String(data.transactions.length);
            if (typeof Chart === 'undefined') return;
            if (!hasData) {
                if (financeChartInstance) {
                    financeChartInstance.destroy();
                    financeChartInstance = null;
                }
                return;
            }
            const dark = document.body.classList.contains('dark');
            const textColor = dark ? '#F1F5F9' : '#30343B';
            const gridColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,25,30,0.08)';
            const type = document.getElementById('chartTypeFilter').value;
            const datasets = [];
            if (type === 'both' || type === 'income') datasets.push({ label: 'Receitas', data: data.income, backgroundColor: 'rgba(48, 190, 135, 0.82)', borderColor: '#30BE87', borderWidth: 1, borderRadius: 6, maxBarThickness: 38 });
            if (type === 'both' || type === 'expense') datasets.push({ label: 'Despesas', data: data.expense, backgroundColor: 'rgba(255, 107, 107, 0.78)', borderColor: '#FF6B6B', borderWidth: 1, borderRadius: 6, maxBarThickness: 38 });
            const chartData = { labels: data.labels, datasets };
            const options = {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', align: 'start', labels: { color: textColor, usePointStyle: true, boxWidth: 8, padding: 18, font: { size: 12 } } },
                    tooltip: { callbacks: { label: context => `${context.dataset.label}: ${formatCurrency(context.parsed.y || 0)}` } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, callback: value => formatCurrency(value) } },
                    x: { grid: { display: false }, ticks: { color: textColor, maxRotation: 35, autoSkip: true, maxTicksLimit: 12 } }
                }
            };
            if (!financeChartInstance) {
                financeChartInstance = new Chart(canvas, { type: 'bar', data: chartData, options });
            } else {
                financeChartInstance.data = chartData;
                financeChartInstance.options = options;
                financeChartInstance.update('none');
            }
        }

        function updateSearchResults(filtered) {
            const list = document.getElementById('searchResultsList');
            const count = document.getElementById('searchResultCount');
            const totalIncome = filtered.reduce((sum, tx) => sum + (tx.type === 'income' ? Number(tx.value) || 0 : 0), 0);
            const totalExpense = filtered.reduce((sum, tx) => sum + (tx.type === 'expense' ? Number(tx.value) || 0 : 0), 0);
            document.getElementById('searchTotalIncome').textContent = formatCurrency(totalIncome);
            document.getElementById('searchTotalExpense').textContent = formatCurrency(totalExpense);
            count.textContent = `${filtered.length} ${t('transactionsFound')}`;
            if (!filtered.length) {
                list.innerHTML = `<div class="empty-state">${t('noTransactionsFound')}</div>`;
                return;
            }
            const byDate = {};
            filtered.forEach(tx => (byDate[tx.date] ||= []).push(tx));
            const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
            list.innerHTML = '<div class="search-results-grouped">' + dates.map(date =>
                `<section class="search-results-date-group"><h4 class="search-results-date-header">${formatDateForDisplay(date)}</h4><div class="search-results-date-list">${byDate[date].map(renderSearchResultCard).join('')}</div></section>`
            ).join('') + '</div>';
        }

        function clearChartCategories() {
            selectedChartCategories.clear();
            updateCategorySummaryLabels();
            updateChart();
        }

        function toggleChartPeriodInputs() {
            const period = document.getElementById('chartPeriod').value;
            const visibility = { custom: 'chartCustomGroup', month: 'chartMonthGroup', year: 'chartYearGroup' };
            Object.entries(visibility).forEach(([key, id]) => {
                const group = document.getElementById(id);
                if (group) group.style.display = period === key ? 'block' : 'none';
            });
            initChartPeriodInputs();
            updateChart();
        }

        function repairRedesignedTabs() {
            const main = document.querySelector('.main-content');
            const search = document.getElementById('search');
            const templates = document.querySelector('template')?.content;
            const transactionTemplate = templates?.querySelector('#new-transaction');
            const chartTemplate = templates?.querySelector('#charts');
            if (!main || !search || !transactionTemplate || !chartTemplate) return;

            search.querySelectorAll('.tab-content').forEach(tab => main.appendChild(tab));
            const searchCard = search.querySelector(':scope > .card');
            const searchTitle = searchCard?.querySelector(':scope > h2');
            const searchFilters = searchCard?.querySelector('.search-filter-panel');
            const searchResults = templates.querySelector('.search-results')?.cloneNode(true);
            if (searchCard && searchTitle && searchFilters && searchResults) {
                searchCard.replaceChildren(searchTitle, searchFilters, searchResults);
            }

            const oldChart = document.getElementById('charts');
            const chart = chartTemplate.cloneNode(true);
            if (oldChart) oldChart.replaceWith(chart);
            main.insertBefore(transactionTemplate.cloneNode(true), chart);
        }

        repairRedesignedTabs();

// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}
