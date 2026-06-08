const supabaseUrl = window.SUPABASE_CONFIG?.url || '';
const supabaseAnonKey = window.SUPABASE_CONFIG?.anonKey || '';
const supabaseClient = supabaseUrl && supabaseAnonKey
  ? window.supabase.createClient(supabaseUrl, supabaseAnonKey)
  : null;

let products = [];
let suppliers = [];
let movements = [];
let config = { theme: 'light', currency: 'BRL' };
let currentUser = null;
let currentProfile = null;
let appReady = false;
let authFlowType = null;

const pages = {
  dashboard: () => renderDashboard(),
  products: () => renderProducts(),
  suppliers: () => renderSuppliers(),
  movements: () => renderMovements(),
  reports: () => renderReports(),
  alerts: () => renderAlerts()
};

function setMainContent(html) {
  document.getElementById('mainContent').innerHTML = html;
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach((navItem) => {
    navItem.classList.toggle('active', navItem.dataset.page === page);
  });
}

function getAuthParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashString = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hashString);

  return {
    type: searchParams.get('type') || hashParams.get('type'),
    accessToken: searchParams.get('access_token') || hashParams.get('access_token'),
    refreshToken: searchParams.get('refresh_token') || hashParams.get('refresh_token'),
    code: searchParams.get('code') || hashParams.get('code'),
    tokenHash: searchParams.get('token_hash') || hashParams.get('token_hash')
  };
}

function isPasswordSetupFlow(authParams) {
  return Boolean(
    authParams.type === 'invite' ||
    authParams.type === 'recovery' ||
    authParams.accessToken ||
    authParams.code ||
    authParams.tokenHash
  );
}

function clearAuthUrlArtifacts() {
  if (window.location.hash || window.location.search) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function showSetPasswordError(message = '') {
  const errorElement = document.getElementById('setPasswordError');
  if (errorElement) {
    errorElement.textContent = message;
  }
}

function updateUserPanel() {
  const userName = document.getElementById('currentUserName');
  const userRole = document.getElementById('currentUserRole');

  if (!userName || !userRole) return;

  userName.textContent = currentUser?.name || currentUser?.email || 'Equipe Dismar';
  userRole.textContent = currentUser?.role || 'Usuario autenticado';
}

function setAuthMode(isLocked) {
  document.body.classList.toggle('auth-locked', isLocked);
}

function setAuthView(view) {
  const loginForm = document.getElementById('loginForm');
  const setPasswordForm = document.getElementById('setPasswordForm');
  const loginTitle = document.querySelector('.login-copy h3');
  const loginDescription = document.getElementById('loginDescription');
  const authNote = document.getElementById('authNote');

  if (!loginForm || !setPasswordForm || !loginTitle || !loginDescription || !authNote) return;

  const isSetPasswordView = view === 'set-password';
  loginForm.classList.toggle('auth-hidden', isSetPasswordView);
  setPasswordForm.classList.toggle('auth-hidden', !isSetPasswordView);

  if (isSetPasswordView) {
    loginTitle.textContent = 'Criar senha de acesso';
    loginDescription.textContent = 'Seu convite foi validado. Defina a senha para concluir o primeiro acesso.';
    authNote.textContent = 'Depois de definir a senha, o login sera feito com e-mail e senha.';
  } else {
    loginTitle.textContent = 'Entrar no sistema';
    loginDescription.textContent = 'Informe suas credenciais para acessar o painel.';
    authNote.textContent = 'O acesso e liberado apenas para usuarios convidados por e-mail.';
  }
}

function openLoginScreen() {
  currentUser = null;
  currentProfile = null;
  updateUserPanel();
  showLoginError('');
  showSetPasswordError('');
  setAuthView('login');
  setAuthMode(true);
}

function showLoginError(message = '') {
  const loginError = document.getElementById('loginError');
  if (loginError) {
    loginError.textContent = message;
  }
}

async function syncCurrentProfile(user) {
  const fallbackName = user.user_metadata?.full_name || user.email || 'Usuario';

  const payload = {
    id: user.id,
    email: user.email,
    full_name: fallbackName,
    is_active: true,
    accepted_at: new Date().toISOString(),
    last_login_at: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from('profiles')
    .upsert(payload, { onConflict: 'id' });

  if (error) throw error;
}

async function fetchCurrentProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, email, full_name, role, is_active, accepted_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function openAppSession(user) {
  if (!supabaseClient) {
    openLoginScreen();
    showLoginError('Supabase nao configurado.');
    return;
  }

  await syncCurrentProfile(user);
  currentProfile = await fetchCurrentProfile(user.id);

  if (currentProfile && currentProfile.is_active === false) {
    await supabaseClient.auth.signOut();
    openLoginScreen();
    showLoginError('Seu usuario esta inativo. Fale com o administrador.');
    return;
  }

  currentUser = {
    name: currentProfile?.full_name || user.user_metadata?.full_name || user.email,
    email: user.email,
    role: currentProfile?.role || 'operator'
  };

  updateUserPanel();
  showLoginError('');
  showSetPasswordError('');
  setAuthMode(false);
  authFlowType = null;
  clearAuthUrlArtifacts();

  if (!appReady) {
    await initializeApp();
  } else {
    renderDashboard();
  }
}

function applyTheme() {
  document.body.classList.toggle('dark', config.theme === 'dark');
  document.getElementById('themeIcon').textContent = config.theme === 'dark' ? 'Sun' : 'Moon';
}

function renderNotice(title, description) {
  setMainContent(`
    <div class="top-bar">
      <div class="page-title">
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
    </div>
    <div class="card">
      <div class="empty-state">
        <div class="empty-icon">DB</div>
        <div class="empty-title">${title}</div>
        <p>${description}</p>
      </div>
    </div>
  `);
}

function handleError(error, fallbackMessage) {
  console.error(error);
  alert(error?.message || fallbackMessage);
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: config.currency || 'BRL'
  }).format(Number(value || 0));
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getSupplierName(supplierId) {
  return suppliers.find((supplier) => supplier.id === supplierId)?.name || 'N/A';
}

function getStockMeta(product) {
  if (product.qty === 0) {
    return { status: 'danger', label: 'Sem Estoque' };
  }

  if (product.qty <= (product.minStock || 10)) {
    return { status: 'warning', label: 'Baixo' };
  }

  return { status: 'success', label: 'OK' };
}

async function fetchSuppliers() {
  const { data, error } = await supabaseClient
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  suppliers = data || [];
}

async function fetchProducts() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('id, name, sku, category, qty, price, min_stock, supplier_id, last_update')
    .order('name', { ascending: true });

  if (error) throw error;

  products = (data || []).map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    qty: product.qty,
    price: Number(product.price),
    minStock: product.min_stock,
    supplier: product.supplier_id,
    lastUpdate: product.last_update
  }));
}

async function fetchMovements() {
  const { data, error } = await supabaseClient
    .from('movements')
    .select('id, product_id, product_name, type, qty, old_qty, new_qty, created_at, notes')
    .order('created_at', { ascending: false });

  if (error) throw error;

  movements = (data || []).map((movement) => ({
    id: movement.id,
    productId: movement.product_id,
    productName: movement.product_name,
    type: movement.type,
    qty: movement.qty,
    oldQty: movement.old_qty,
    newQty: movement.new_qty,
    date: movement.created_at,
    notes: movement.notes
  }));
}

async function fetchConfig() {
  const { data, error } = await supabaseClient
    .from('app_config')
    .select('theme, currency')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  config = data || { theme: 'light', currency: 'BRL' };
  applyTheme();
}

async function loadAppData() {
  await Promise.all([
    fetchSuppliers(),
    fetchProducts(),
    fetchMovements(),
    fetchConfig()
  ]);
}

async function saveConfig() {
  const { error } = await supabaseClient
    .from('app_config')
    .upsert({
      id: 1,
      theme: config.theme,
      currency: config.currency
    });

  if (error) throw error;
}

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', (event) => {
    event.preventDefault();
    const page = event.currentTarget.dataset.page;
    setActiveNav(page);

    if (pages[page]) {
      pages[page]();
    }
  });
});

document.getElementById('themeToggle').addEventListener('click', async () => {
  const previousTheme = config.theme;
  config.theme = previousTheme === 'dark' ? 'light' : 'dark';
  applyTheme();

  if (!supabaseClient) {
    return;
  }

  try {
    await saveConfig();
  } catch (error) {
    config.theme = previousTheme;
    applyTheme();
    handleError(error, 'Nao foi possivel salvar o tema.');
  }
});

function renderDashboard() {
  const totalProducts = products.length;
  const totalQty = products.reduce((sum, product) => sum + (product.qty || 0), 0);
  const totalValue = products.reduce((sum, product) => sum + ((product.qty || 0) * (product.price || 0)), 0);
  const lowStock = products.filter((product) => product.qty <= (product.minStock || 10)).length;
  const recentMovements = movements.slice(0, 5);
  const topProducts = [...products]
    .sort((a, b) => (b.qty * b.price) - (a.qty * a.price))
    .slice(0, 5);

  setMainContent(`
    <div class="top-bar">
      <div class="page-title">
        <h2>Dashboard</h2>
        <p>Visao geral do estoque</p>
      </div>
      <div class="top-actions">
        <div class="search-box">
          <span class="search-icon">?</span>
          <input type="text" placeholder="Buscar produtos..." id="quickSearch">
        </div>
        <button class="btn btn-primary" id="addProductBtn">
          <span>+</span> Novo Produto
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Total de Produtos</span>
          <div class="stat-icon" style="background: rgba(23, 162, 184, 0.1); color: var(--info);">P</div>
        </div>
        <div class="stat-value">${totalProducts}</div>
        <span class="stat-change positive">${products.length > 0 ? '+5%' : '0%'} este mes</span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Quantidade Total</span>
          <div class="stat-icon" style="background: rgba(40, 167, 69, 0.1); color: var(--success);">Q</div>
        </div>
        <div class="stat-value">${totalQty}</div>
        <span class="stat-change positive">+12% este mes</span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Valor Total</span>
          <div class="stat-icon" style="background: rgba(155, 0, 0, 0.1); color: var(--primary);">R$</div>
        </div>
        <div class="stat-value">${formatMoney(totalValue)}</div>
        <span class="stat-change positive">+8% este mes</span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Estoque Baixo</span>
          <div class="stat-icon" style="background: rgba(255, 193, 7, 0.1); color: var(--warning);">!</div>
        </div>
        <div class="stat-value">${lowStock}</div>
        <span class="stat-change ${lowStock > 0 ? 'negative' : 'positive'}">${lowStock > 0 ? 'Atencao necessaria' : 'Tudo OK'}</span>
      </div>
    </div>

    <div class="dashboard-panels">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Produtos Mais Valiosos</h3>
        </div>
        ${topProducts.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Valor Total</th>
                </tr>
              </thead>
              <tbody>
                ${topProducts.map((product) => `
                  <tr>
                    <td>
                      <strong>${product.name}</strong><br>
                      <small style="color: var(--text-muted);">${product.category || 'Sem categoria'}</small>
                    </td>
                    <td>${product.qty}</td>
                    <td><strong>${formatMoney(product.qty * product.price)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-state"><div class="empty-icon">P</div><div class="empty-title">Nenhum produto cadastrado</div></div>'}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Movimentacoes Recentes</h3>
        </div>
        ${recentMovements.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                ${recentMovements.map((movement) => `
                  <tr>
                    <td><span class="badge ${movement.type === 'entry' ? 'badge-success' : 'badge-danger'}">${movement.type === 'entry' ? 'Entrada' : 'Saida'}</span></td>
                    <td>${movement.productName}</td>
                    <td>${movement.qty}</td>
                    <td><small>${formatDate(movement.date)}</small></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-state"><div class="empty-icon">M</div><div class="empty-title">Nenhuma movimentacao registrada</div></div>'}
      </div>
    </div>
  `);

  document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
  document.getElementById('quickSearch')?.addEventListener('input', quickSearch);
}

function renderProducts() {
  setMainContent(`
    <div class="top-bar">
      <div class="page-title">
        <h2>Produtos</h2>
        <p>Gerencie seu catalogo de produtos</p>
      </div>
      <div class="top-actions">
        <div class="search-box">
          <span class="search-icon">?</span>
          <input type="text" placeholder="Buscar produtos..." id="searchProducts">
        </div>
        <button class="btn btn-primary" id="addProductBtn">
          <span>+</span> Novo Produto
        </button>
      </div>
    </div>

    <div class="filters">
      <button class="filter-btn active" data-filter="all">Todos</button>
      <button class="filter-btn" data-filter="lowStock">Estoque Baixo</button>
      <button class="filter-btn" data-filter="outOfStock">Sem Estoque</button>
    </div>

    <div class="card">
      <div id="productsTable"></div>
    </div>
  `);

  renderProductsTable();

  document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
  document.getElementById('searchProducts').addEventListener('input', (event) => {
    renderProductsTable(event.target.value);
  });

  document.querySelectorAll('.filter-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      document.querySelectorAll('.filter-btn').forEach((filterButton) => filterButton.classList.remove('active'));
      event.target.classList.add('active');

      const filter = event.target.dataset.filter;
      let filtered = products;

      if (filter === 'lowStock') {
        filtered = products.filter((product) => product.qty > 0 && product.qty <= (product.minStock || 10));
      } else if (filter === 'outOfStock') {
        filtered = products.filter((product) => product.qty === 0);
      }

      renderProductsTable('', filtered);
    });
  });
}

function renderProductsTable(search = '', filtered = products) {
  const tableEl = document.getElementById('productsTable');
  if (!tableEl) return;

  let list = filtered;
  if (search) {
    const term = search.toLowerCase();
    list = filtered.filter((product) =>
      product.name.toLowerCase().includes(term) ||
      (product.sku || '').toLowerCase().includes(term) ||
      (product.category || '').toLowerCase().includes(term)
    );
  }

  if (list.length === 0) {
    tableEl.innerHTML = '<div class="empty-state"><div class="empty-icon">P</div><div class="empty-title">Nenhum produto encontrado</div><p>Adicione um novo produto para comecar</p></div>';
    return;
  }

  tableEl.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Produto</th>
          <th>SKU</th>
          <th>Categoria</th>
          <th>Quantidade</th>
          <th>Preco Unit.</th>
          <th>Valor Total</th>
          <th>Status</th>
          <th>Acoes</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((product) => {
          const stockMeta = getStockMeta(product);

          return `
            <tr>
              <td>
                <strong>${product.name}</strong><br>
                ${product.supplier ? `<small style="color: var(--text-muted);">Fornecedor: ${getSupplierName(product.supplier)}</small>` : ''}
              </td>
              <td><span class="badge badge-info">${product.sku || '-'}</span></td>
              <td>${product.category || '-'}</td>
              <td><strong>${product.qty}</strong></td>
              <td>${formatMoney(product.price)}</td>
              <td><strong>${formatMoney(product.qty * product.price)}</strong></td>
              <td><span class="badge badge-${stockMeta.status}">${stockMeta.label}</span></td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon" onclick="adjustStock('${product.id}', 'entry')" title="Entrada">+</button>
                  <button class="btn-icon" onclick="adjustStock('${product.id}', 'exit')" title="Saida">-</button>
                  <button class="btn-icon" onclick="editProduct('${product.id}')" title="Editar">E</button>
                  <button class="btn-icon" onclick="deleteProduct('${product.id}')" title="Excluir">X</button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function renderSuppliers() {
  setMainContent(`
    <div class="top-bar">
      <div class="page-title">
        <h2>Fornecedores</h2>
        <p>Gerencie seus fornecedores</p>
      </div>
      <div class="top-actions">
        <div class="search-box">
          <span class="search-icon">?</span>
          <input type="text" placeholder="Buscar fornecedores..." id="searchSuppliers">
        </div>
        <button class="btn btn-primary" id="addSupplierBtn">
          <span>+</span> Novo Fornecedor
        </button>
      </div>
    </div>

    <div class="card">
      <div id="suppliersTable"></div>
    </div>
  `);

  renderSuppliersTable();

  document.getElementById('addSupplierBtn').addEventListener('click', () => openSupplierModal());
  document.getElementById('searchSuppliers').addEventListener('input', (event) => {
    renderSuppliersTable(event.target.value);
  });
}

function renderSuppliersTable(search = '') {
  const tableEl = document.getElementById('suppliersTable');
  if (!tableEl) return;

  let list = suppliers;
  if (search) {
    const term = search.toLowerCase();
    list = suppliers.filter((supplier) =>
      supplier.name.toLowerCase().includes(term) ||
      (supplier.cnpj || '').toLowerCase().includes(term) ||
      (supplier.email || '').toLowerCase().includes(term)
    );
  }

  if (list.length === 0) {
    tableEl.innerHTML = '<div class="empty-state"><div class="empty-icon">F</div><div class="empty-title">Nenhum fornecedor encontrado</div><p>Adicione um novo fornecedor para comecar</p></div>';
    return;
  }

  tableEl.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>CNPJ</th>
          <th>Telefone</th>
          <th>E-mail</th>
          <th>Produtos</th>
          <th>Acoes</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((supplier) => {
          const productsCount = products.filter((product) => product.supplier === supplier.id).length;

          return `
            <tr>
              <td><strong>${supplier.name}</strong></td>
              <td>${supplier.cnpj || '-'}</td>
              <td>${supplier.phone || '-'}</td>
              <td>${supplier.email || '-'}</td>
              <td><span class="badge badge-info">${productsCount} produto${productsCount !== 1 ? 's' : ''}</span></td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon" onclick="editSupplier('${supplier.id}')" title="Editar">E</button>
                  <button class="btn-icon" onclick="deleteSupplier('${supplier.id}')" title="Excluir">X</button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function renderMovements() {
  setMainContent(`
    <div class="top-bar">
      <div class="page-title">
        <h2>Movimentacoes</h2>
        <p>Historico de entradas e saidas</p>
      </div>
    </div>

    <div class="filters">
      <button class="filter-btn active" data-filter="all">Todas</button>
      <button class="filter-btn" data-filter="entry">Entradas</button>
      <button class="filter-btn" data-filter="exit">Saidas</button>
    </div>

    <div class="card">
      <div id="movementsTable"></div>
    </div>
  `);

  renderMovementsTable();

  document.querySelectorAll('.filter-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      document.querySelectorAll('.filter-btn').forEach((filterButton) => filterButton.classList.remove('active'));
      event.target.classList.add('active');

      const filter = event.target.dataset.filter;
      const filtered = filter === 'all' ? movements : movements.filter((movement) => movement.type === filter);
      renderMovementsTable(filtered);
    });
  });
}

function renderMovementsTable(list = movements) {
  const tableEl = document.getElementById('movementsTable');
  if (!tableEl) return;

  if (list.length === 0) {
    tableEl.innerHTML = '<div class="empty-state"><div class="empty-icon">M</div><div class="empty-title">Nenhuma movimentacao registrada</div></div>';
    return;
  }

  tableEl.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Produto</th>
          <th>Quantidade</th>
          <th>Observacoes</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((movement) => `
          <tr>
            <td>${formatDate(movement.date)}</td>
            <td><span class="badge ${movement.type === 'entry' ? 'badge-success' : 'badge-danger'}">${movement.type === 'entry' ? 'Entrada' : 'Saida'}</span></td>
            <td><strong>${movement.productName}</strong></td>
            <td><strong>${movement.qty}</strong></td>
            <td>${movement.notes || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function renderReports() {
  const totalValue = products.reduce((sum, product) => sum + (product.qty * product.price), 0);
  const avgValue = products.length > 0 ? totalValue / products.length : 0;
  const categoriesMap = {};

  products.forEach((product) => {
    const category = product.category || 'Sem categoria';
    if (!categoriesMap[category]) {
      categoriesMap[category] = { count: 0, value: 0 };
    }

    categoriesMap[category].count += product.qty;
    categoriesMap[category].value += product.qty * product.price;
  });

  setMainContent(`
    <div class="top-bar">
      <div class="page-title">
        <h2>Relatorios</h2>
        <p>Analises e estatisticas do estoque</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Valor Medio por Produto</span>
          <div class="stat-icon" style="background: rgba(155, 0, 0, 0.1); color: var(--primary);">R$</div>
        </div>
        <div class="stat-value">${formatMoney(avgValue)}</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Categorias Cadastradas</span>
          <div class="stat-icon" style="background: rgba(23, 162, 184, 0.1); color: var(--info);">C</div>
        </div>
        <div class="stat-value">${Object.keys(categoriesMap).length}</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Movimentacoes</span>
          <div class="stat-icon" style="background: rgba(40, 167, 69, 0.1); color: var(--success);">M</div>
        </div>
        <div class="stat-value">${movements.length}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Valor por Categoria</h3>
      </div>
      ${Object.keys(categoriesMap).length > 0 ? `
        <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Quantidade Total</th>
              <th>Valor Total</th>
              <th>% do Estoque</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(categoriesMap)
              .sort((a, b) => b[1].value - a[1].value)
              .map(([category, data]) => {
                const percentage = totalValue > 0 ? ((data.value / totalValue) * 100).toFixed(1) : '0.0';

                return `
                  <tr>
                    <td><strong>${category}</strong></td>
                    <td>${data.count}</td>
                    <td><strong>${formatMoney(data.value)}</strong></td>
                    <td>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; height: 8px; background: var(--bg-light); border-radius: 4px; overflow: hidden;">
                          <div style="height: 100%; width: ${percentage}%; background: var(--primary);"></div>
                        </div>
                        <span style="font-weight: 600;">${percentage}%</span>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
        </div>
      ` : '<div class="empty-state"><div class="empty-icon">R</div><div class="empty-title">Sem dados para exibir</div></div>'}
    </div>
  `);
}

function renderAlerts() {
  const lowStock = products.filter((product) => product.qty > 0 && product.qty <= (product.minStock || 10));
  const outOfStock = products.filter((product) => product.qty === 0);

  setMainContent(`
    <div class="top-bar">
      <div class="page-title">
        <h2>Alertas</h2>
        <p>Produtos que requerem atencao</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Estoque Baixo (${lowStock.length})</h3>
      </div>
      ${lowStock.length > 0 ? `
        <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Quantidade Atual</th>
              <th>Estoque Minimo</th>
              <th>Acao</th>
            </tr>
          </thead>
          <tbody>
            ${lowStock.map((product) => `
              <tr>
                <td><strong>${product.name}</strong></td>
                <td><span class="badge badge-warning">${product.qty}</span></td>
                <td>${product.minStock || 10}</td>
                <td>
                  <button class="btn btn-primary" onclick="adjustStock('${product.id}', 'entry')" style="padding: 6px 12px; font-size: 12px;">
                    Adicionar Estoque
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      ` : '<div class="empty-state"><div class="empty-icon">OK</div><div class="empty-title">Nenhum produto com estoque baixo</div></div>'}
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Sem Estoque (${outOfStock.length})</h3>
      </div>
      ${outOfStock.length > 0 ? `
        <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Ultima Atualizacao</th>
              <th>Acao</th>
            </tr>
          </thead>
          <tbody>
            ${outOfStock.map((product) => `
              <tr>
                <td><strong>${product.name}</strong></td>
                <td>${product.category || '-'}</td>
                <td>${product.lastUpdate ? formatDate(product.lastUpdate) : '-'}</td>
                <td>
                  <button class="btn btn-primary" onclick="adjustStock('${product.id}', 'entry')" style="padding: 6px 12px; font-size: 12px;">
                    Repor Estoque
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      ` : '<div class="empty-state"><div class="empty-icon">OK</div><div class="empty-title">Nenhum produto sem estoque</div></div>'}
    </div>
  `);
}

function openProductModal(productId = null) {
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const title = document.getElementById('productModalTitle');
  const supplierSelect = form.supplier;

  supplierSelect.innerHTML = '<option value="">Selecione...</option>' +
    suppliers.map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`).join('');

  if (productId) {
    const product = products.find((item) => item.id === productId);
    if (product) {
      title.textContent = 'Editar Produto';
      form.name.value = product.name;
      form.sku.value = product.sku || '';
      form.category.value = product.category || '';
      form.qty.value = product.qty;
      form.price.value = product.price;
      form.minStock.value = product.minStock || 10;
      form.supplier.value = product.supplier || '';
      form.dataset.editId = productId;
    }
  } else {
    title.textContent = 'Novo Produto';
    form.reset();
    delete form.dataset.editId;
  }

  modal.classList.add('open');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
  document.getElementById('productForm').reset();
}

document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
document.getElementById('cancelProduct').addEventListener('click', closeProductModal);

document.getElementById('productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;

  const payload = {
    name: form.name.value.trim(),
    sku: form.sku.value.trim() || null,
    category: form.category.value.trim() || null,
    qty: parseInt(form.qty.value, 10),
    price: parseFloat(form.price.value),
    min_stock: parseInt(form.minStock.value, 10) || 10,
    supplier_id: form.supplier.value || null,
    last_update: new Date().toISOString()
  };

  try {
    if (form.dataset.editId) {
      const { error } = await supabaseClient
        .from('products')
        .update(payload)
        .eq('id', form.dataset.editId);

      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from('products')
        .insert(payload);

      if (error) throw error;
    }

    await fetchProducts();
    closeProductModal();
    renderProducts();
  } catch (error) {
    handleError(error, 'Nao foi possivel salvar o produto.');
  }
});

function openSupplierModal(supplierId = null) {
  const modal = document.getElementById('supplierModal');
  const form = document.getElementById('supplierForm');
  const title = document.getElementById('supplierModalTitle');

  if (supplierId) {
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (supplier) {
      title.textContent = 'Editar Fornecedor';
      form.name.value = supplier.name;
      form.cnpj.value = supplier.cnpj || '';
      form.phone.value = supplier.phone || '';
      form.email.value = supplier.email || '';
      form.address.value = supplier.address || '';
      form.dataset.editId = supplierId;
    }
  } else {
    title.textContent = 'Novo Fornecedor';
    form.reset();
    delete form.dataset.editId;
  }

  modal.classList.add('open');
}

function closeSupplierModal() {
  document.getElementById('supplierModal').classList.remove('open');
  document.getElementById('supplierForm').reset();
}

document.getElementById('closeSupplierModal').addEventListener('click', closeSupplierModal);
document.getElementById('cancelSupplier').addEventListener('click', closeSupplierModal);

document.getElementById('supplierForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;

  const payload = {
    name: form.name.value.trim(),
    cnpj: form.cnpj.value.trim() || null,
    phone: form.phone.value.trim() || null,
    email: form.email.value.trim() || null,
    address: form.address.value.trim() || null
  };

  try {
    if (form.dataset.editId) {
      const { error } = await supabaseClient
        .from('suppliers')
        .update(payload)
        .eq('id', form.dataset.editId);

      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from('suppliers')
        .insert(payload);

      if (error) throw error;
    }

    await Promise.all([fetchSuppliers(), fetchProducts()]);
    closeSupplierModal();
    renderSuppliers();
  } catch (error) {
    handleError(error, 'Nao foi possivel salvar o fornecedor.');
  }
});

window.editProduct = (id) => openProductModal(id);
window.editSupplier = (id) => openSupplierModal(id);

window.deleteProduct = async (id) => {
  if (!confirm('Deseja realmente excluir este produto?')) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await Promise.all([fetchProducts(), fetchMovements()]);
    renderProducts();
  } catch (error) {
    handleError(error, 'Nao foi possivel excluir o produto.');
  }
};

window.deleteSupplier = async (id) => {
  const hasProducts = products.some((product) => product.supplier === id);
  if (hasProducts) {
    alert('Nao e possivel excluir este fornecedor pois existem produtos vinculados a ele.');
    return;
  }

  if (!confirm('Deseja realmente excluir este fornecedor?')) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await fetchSuppliers();
    renderSuppliers();
  } catch (error) {
    handleError(error, 'Nao foi possivel excluir o fornecedor.');
  }
};

window.adjustStock = async (id, type) => {
  const product = products.find((item) => item.id === id);
  if (!product) return;

  const qty = parseInt(prompt(`${type === 'entry' ? 'Entrada' : 'Saida'} de estoque para ${product.name}:\n\nQuantidade:`), 10);
  if (!qty || qty <= 0) return;

  try {
    const { error } = await supabaseClient.rpc('adjust_product_stock', {
      p_product_id: product.id,
      p_type: type,
      p_qty: qty,
      p_notes: ''
    });

    if (error) throw error;

    await Promise.all([fetchProducts(), fetchMovements()]);
    renderProducts();
  } catch (error) {
    if (error?.message === 'Insufficient stock') {
      alert('Quantidade insuficiente em estoque!');
      return;
    }

    handleError(error, 'Nao foi possivel atualizar o estoque.');
  }
};

function quickSearch(event) {
  const term = event.target.value.toLowerCase();
  if (term.length < 2) return;

  const results = products.filter((product) =>
    product.name.toLowerCase().includes(term) ||
    (product.sku || '').toLowerCase().includes(term)
  ).slice(0, 5);

  console.log('Resultados da busca:', results);
}

async function initializeApp() {
  applyTheme();
  appReady = true;

  if (!supabaseClient) {
    renderNotice(
      'Configuracao do Supabase pendente',
      'Preencha supabase-config.js com a URL e a anon key do projeto e rode o arquivo supabase-schema.sql no painel do Supabase.'
    );
    return;
  }

  renderNotice('Conectando...', 'Carregando produtos, fornecedores e movimentacoes do Supabase.');

  try {
    await loadAppData();
    renderDashboard();
  } catch (error) {
    console.error(error);
    renderNotice(
      'Falha ao conectar',
      'Nao foi possivel carregar os dados do Supabase. Confira as credenciais e o schema SQL.'
    );
  }
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!supabaseClient) {
    showLoginError('Supabase nao configurado.');
    return;
  }

  const email = event.target.email.value.trim().toLowerCase();
  const password = event.target.password.value.trim();

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data.user) throw new Error('Nao foi possivel iniciar a sessao.');

    await openAppSession(data.user);
  } catch (error) {
    showLoginError('Credenciais invalidas ou acesso nao liberado.');
    console.error(error);
  }
});

document.getElementById('setPasswordForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!supabaseClient) {
    showSetPasswordError('Supabase nao configurado.');
    return;
  }

  const password = event.target.password.value.trim();
  const passwordConfirm = event.target.passwordConfirm.value.trim();

  if (password.length < 6) {
    showSetPasswordError('A senha precisa ter pelo menos 6 caracteres.');
    return;
  }

  if (password !== passwordConfirm) {
    showSetPasswordError('As senhas nao coincidem.');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    if (!data.user) throw new Error('Nao foi possivel concluir o convite.');

    authFlowType = null;
    await openAppSession(data.user);
  } catch (error) {
    showSetPasswordError(error?.message || 'Nao foi possivel definir a senha.');
    console.error(error);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }

  document.getElementById('loginForm').reset();
  document.getElementById('setPasswordForm').reset();
  openLoginScreen();
});

async function initializeLogin() {
  updateUserPanel();

  if (!supabaseClient) {
    openLoginScreen();
    showLoginError('Supabase nao configurado.');
    return;
  }

  const authParams = getAuthParams();
  authFlowType = authParams.type;
  const shouldOpenPasswordSetup = isPasswordSetupFlow(authParams);

  if (authParams.code) {
    try {
      const { error } = await supabaseClient.auth.exchangeCodeForSession(authParams.code);
      if (error) throw error;
    } catch (error) {
      console.error(error);
      openLoginScreen();
      showLoginError('Nao foi possivel validar o convite. Solicite um novo link.');
      return;
    }
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      openLoginScreen();
      return;
    }

    if (!session?.user) {
      return;
    }

    if (shouldOpenPasswordSetup) {
      setAuthView('set-password');
      setAuthMode(true);
      return;
    }

    void openAppSession(session.user);
  });

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error(error);
  }

  const sessionUser = data.session?.user;

  if (sessionUser && shouldOpenPasswordSetup) {
    setAuthView('set-password');
    setAuthMode(true);
    return;
  }

  if (sessionUser) {
    await openAppSession(sessionUser);
    return;
  }

  openLoginScreen();
}

initializeLogin();
