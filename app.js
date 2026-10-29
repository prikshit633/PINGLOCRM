(() => {
  const CUSTOMER_KEY = 'dukaan-saathi-customers-v1';
  const TEMPLATE_KEY = 'dukaan-saathi-templates-v1';
  const PROFILE_KEY = 'dukaan-saathi-profile-v1';
  const THEME_KEY = 'dukaan-saathi-theme-v1';
  const LANGUAGE_KEY = 'dukaan-saathi-language-v1';
  const AUTH_DEMO_KEY = 'pinglo-demo-session-v1';
  const supabaseConfig = window.PINGLO_SUPABASE_CONFIG || {};
  const supabaseConfigReady = Boolean(String(supabaseConfig.url || '').trim() && String(supabaseConfig.publishableKey || '').trim());
  const createClient = window.supabase?.createClient;
  let supabase = null;
  let supabaseInitError = null;
  if (supabaseConfigReady) {
    try {
      if (typeof createClient !== 'function') throw new Error('Supabase JavaScript SDK did not load.');
      supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (error) { supabaseInitError = error; }
  }
  let currentUser = null;
  let cloudReady = false;
  let cloudCustomerIds = new Set();
  let cloudWriteQueue = Promise.resolve();
  const localeData = window.DukaanLocales || { languages: [{ code: 'en', label: 'English', locale: 'en-IN' }], messages: { en: {} } };
  const defaultProfile = { ownerName: 'Asha', businessName: "Asha's Boutique" };
  const statuses = ['New', 'Contacted', 'Interested', 'Confirmed', 'Completed'];
  const templateDefaults = [
    { id: 'follow-up', name: 'Follow-up', icon: '↗', text: 'Hi {{name}}! 😊 Just checking in about your enquiry at Asha’s Boutique. Let me know if I can help with anything. — Asha' },
    { id: 'order-ready', name: 'Order Ready', icon: '▣', text: 'Namaste {{name}}, your order is ready at Asha’s Boutique! Drop by whenever convenient. Thank you 😊' },
    { id: 'payment-reminder', name: 'Payment Reminder', icon: '₹', text: 'Hi {{name}}, a friendly reminder about the pending payment for your order at Asha’s Boutique. Please let me know if you have any questions. Thank you!' },
    { id: 'appointment-reminder', name: 'Appointment Reminder', icon: '◷', text: 'Namaste {{name}}! Just a reminder about your appointment at Asha’s Boutique. Looking forward to seeing you 😊' },
    { id: 'thank-you', name: 'Thank You', icon: '♡', text: 'Thank you for choosing Asha’s Boutique, {{name}}! We truly appreciate your support. Hope to see you again soon 💚' }
  ];
  const today = startOfDay(new Date());
  let activeFollowupFilter = 'all';
  let activeMessageTemplateIndex = 0;
  let toastTimer;

  function startOfDay(date) { const copy = new Date(date); copy.setHours(0, 0, 0, 0); return copy; }
  function localDateString(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function dateOffset(days) { const d = new Date(today); d.setDate(d.getDate() + days); return localDateString(d); }
  function demoCustomers() {
    return [
      { id: 'demo-1', name: 'Ananya Kapoor', phone: '+91 98765 43210', status: 'New', nextFollowUp: dateOffset(0), notes: 'Asked about the hand-block printed kurta in teal.', createdAt: dateOffset(-2) },
      { id: 'demo-2', name: 'Rahul Verma', phone: '+91 98123 45670', status: 'Interested', nextFollowUp: dateOffset(-2), notes: 'Comparing two cotton shirt styles; prefers size L.', createdAt: dateOffset(-8) },
      { id: 'demo-3', name: 'Priya Nair', phone: '+91 99001 23456', status: 'Contacted', nextFollowUp: dateOffset(0), notes: 'Send a photo of the new arrivals this afternoon.', createdAt: dateOffset(-4) },
      { id: 'demo-4', name: 'Sanjay Gupta', phone: '+91 98220 11223', status: 'New', nextFollowUp: dateOffset(-1), notes: 'Enquired about bulk gifting for a family event.', createdAt: dateOffset(-5) },
      { id: 'demo-5', name: 'Meera Shah', phone: '+91 98980 76543', status: 'Confirmed', nextFollowUp: dateOffset(1), notes: 'Alteration pickup; ready by Thursday.', createdAt: dateOffset(-10) },
      { id: 'demo-6', name: 'Aarav Joshi', phone: '+91 97654 32109', status: 'Interested', nextFollowUp: dateOffset(0), notes: 'Looking for a gift set under ₹2,000.', createdAt: dateOffset(-1) },
      { id: 'demo-7', name: 'Fatima Khan', phone: '+91 98701 23456', status: 'Contacted', nextFollowUp: dateOffset(3), notes: 'Asked us to share the weekend collection.', createdAt: dateOffset(-6) },
      { id: 'demo-8', name: 'Kavya Iyer', phone: '+91 98450 67891', status: 'Completed', nextFollowUp: '', notes: 'Picked up her order. Sent a thank-you message.', createdAt: dateOffset(-14) },
      { id: 'demo-9', name: 'Deepak Sharma', phone: '+91 98111 22334', status: 'New', nextFollowUp: dateOffset(2), notes: 'Walk-in enquiry about festival gift wrapping.', createdAt: dateOffset(-1) }
    ];
  }
  function readStorage(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
  let customers = readStorage(CUSTOMER_KEY, null);
  if (!Array.isArray(customers)) { customers = demoCustomers(); saveCustomers(); }
  let templates = readStorage(TEMPLATE_KEY, null);
  if (!Array.isArray(templates) || templates.length !== templateDefaults.length) templates = templateDefaults.map(t => ({ ...t }));
  let profile = readStorage(PROFILE_KEY, null);
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) profile = { ...defaultProfile };
  profile = { ...defaultProfile, ...profile };
  let themeMode = 'system';
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (['light', 'dark', 'system'].includes(savedTheme)) themeMode = savedTheme;
  } catch {}
  let languageCode = 'en';
  try {
    const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
    if (localeData.languages.some(language => language.code === savedLanguage)) languageCode = savedLanguage;
  } catch {}

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const language = () => localeData.languages.find(item => item.code === languageCode) || localeData.languages[0];
  const t = (phrase, values = {}) => {
    const translated = localeData.messages?.[languageCode]?.[phrase] || localeData.messages?.en?.[phrase] || phrase;
    return translated.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
  };
  const staticTextNodes = [];
  const staticAttributes = [];
  const dynamicContentSelector = '.profile-copy, #profile-business-name, #profile-owner-label, #profile-avatar, #mobile-profile-button, #profile-menu-business, #profile-menu-owner, #welcome-title, #crumb-current, #toast, .person-name, .person-meta, .followup-note, .customer-notes, .template-grid';
  function captureStaticContent() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim() || node.parentElement.closest(`input, textarea, script, style, [contenteditable="true"], ${dynamicContentSelector}`)) continue;
      staticTextNodes.push({ node, original: node.nodeValue });
    }
    for (const element of $$('input, textarea, select, button, a, label')) {
      if (element.matches(dynamicContentSelector) || element.closest(dynamicContentSelector)) continue;
      const attributes = {};
      for (const name of ['placeholder', 'title', 'aria-label']) {
        if (element.hasAttribute(name)) attributes[name] = element.getAttribute(name);
      }
      if (Object.keys(attributes).length) staticAttributes.push({ element, attributes });
    }
  }
  function applyLocale() {
    const currentLanguage = language();
    document.documentElement.lang = currentLanguage.locale;
    document.documentElement.dir = currentLanguage.dir || 'ltr';
    $('#language-select').value = currentLanguage.code;
    for (const { node, original } of staticTextNodes) {
      if (!node.isConnected) continue;
      const phrase = original.trim();
      const leading = original.match(/^\s*/)?.[0] || '';
      const trailing = original.match(/\s*$/)?.[0] || '';
      node.nodeValue = `${leading}${t(phrase)}${trailing}`;
    }
    for (const { element, attributes } of staticAttributes) {
      if (!element.isConnected) continue;
      for (const [name, original] of Object.entries(attributes)) element.setAttribute(name, t(original));
    }
    $('#today-label').textContent = new Intl.DateTimeFormat(currentLanguage.locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(today);
    if (typeof updateAuthMode === 'function') updateAuthMode();
  }
  const dashboardList = $('#dashboard-followups');
  const customerList = $('#customer-list');
  const modal = $('#customer-modal');
  const form = $('#customer-form');
  const messageModal = $('#message-modal');
  const messageForm = $('#message-form');
  const profileModal = $('#profile-modal');
  const profileForm = $('#profile-form');
  const profileMenu = $('#profile-menu');
  const authScreen = $('#auth-screen');
  const authForm = $('#auth-form');
  const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function saveCustomers() {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customers));
    if (!cloudReady || !currentUser || !supabase) return Promise.resolve();
    const userId = currentUser.id;
    const savedCustomers = customers.map(customer => ({ ...customer }));
    const nextIds = new Set(savedCustomers.map(customer => String(customer.id)));
    cloudWriteQueue = cloudWriteQueue.then(async () => {
      const removedIds = [...cloudCustomerIds].filter(id => !nextIds.has(id));
      const rows = savedCustomers.map(customer => ({
        user_id: userId,
        id: String(customer.id),
        name: String(customer.name || ''),
        phone: String(customer.phone || ''),
        status: statuses.includes(customer.status) ? customer.status : 'New',
        next_follow_up: customer.nextFollowUp || null,
        notes: String(customer.notes || ''),
        created_at: customer.createdAt || localDateString(today)
      }));
      if (rows.length) {
        const { error } = await supabase.from('pinglo_customers').upsert(rows, { onConflict: 'user_id,id' });
        if (error) throw error;
      }
      if (removedIds.length) {
        const { error } = await supabase.from('pinglo_customers').delete().eq('user_id', userId).in('id', removedIds);
        if (error) throw error;
      }
      cloudCustomerIds = nextIds;
    }).catch(error => {
      console.error('Pinglo customer sync failed', error);
      showToast(t('Could not sync customer changes. Check your connection.'));
    });
    return cloudWriteQueue;
  }
  function saveCloudAccountData() {
    if (!cloudReady || !currentUser || !supabase) return Promise.resolve();
    const userId = currentUser.id;
    const profileRow = {
      user_id: userId,
      owner_name: profile.ownerName,
      business_name: profile.businessName,
      updated_at: new Date().toISOString()
    };
    const templateRows = templates.map((template, index) => ({
      user_id: userId,
      id: template.id,
      name: template.name,
      icon: template.icon || '',
      message: template.text || '',
      sort_order: index,
      updated_at: new Date().toISOString()
    }));
    cloudWriteQueue = cloudWriteQueue.then(async () => {
      const { error: profileError } = await supabase.from('pinglo_profiles').upsert(profileRow, { onConflict: 'user_id' });
      if (profileError) throw profileError;
      if (templateRows.length) {
        const { error: templateError } = await supabase.from('pinglo_templates').upsert(templateRows, { onConflict: 'user_id,id' });
        if (templateError) throw templateError;
      }
    }).catch(error => {
      console.error('Pinglo account sync failed', error);
      showToast(t('Could not sync account changes. Check your connection.'));
    });
    return cloudWriteQueue;
  }
  function saveTemplates() {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
    saveCloudAccountData();
  }
  function escapeHTML(value = '') { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function applyThemeMode() {
    const effectiveTheme = themeMode === 'system' ? (systemThemeQuery.matches ? 'dark' : 'light') : themeMode;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.dataset.colorScheme = effectiveTheme;
    $('meta[name="theme-color"]').content = effectiveTheme === 'dark' ? '#171e19' : '#f7f7f2';
    $$('.theme-choice').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === themeMode)));
  }
  function initials(name) { const value = String(name || '?').trim(); if (/^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, '').length >= 10) return '☎'; return value.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase(); }
  function isPhoneName(customer) { const nameDigits = String(customer?.name || '').replace(/\D/g, ''); const phoneDigits = String(customer?.phone || '').replace(/\D/g, ''); return nameDigits.length >= 10 && (nameDigits === phoneDigits || (nameDigits.length === 10 && phoneDigits.endsWith(nameDigits))); }
  function avatarColor(name) { const colors = ['#f3e8dd|#8a6b4e', '#e5efe7|#557b5e', '#ece8f4|#776899', '#f7eadc|#a5794a', '#e5eef1|#5c7883', '#f4e6e6|#9a6666']; let hash = 0; for (const c of String(name)) hash = (hash * 31 + c.charCodeAt(0)) | 0; return colors[Math.abs(hash) % colors.length].split('|'); }
  function avatarHTML(name, extra = '') { const [bg, color] = avatarColor(name); return `<span class="avatar ${extra}" style="background:${bg};color:${color}">${escapeHTML(initials(name))}</span>`; }
  function prettyDate(value) { if (!value) return t('Not set'); const d = parseDate(value); return new Intl.DateTimeFormat(language().locale, { day: 'numeric', month: 'short' }).format(d); }
  function parseDate(value) { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); }
  function dayDifference(value) { if (!value) return null; return Math.round((startOfDay(parseDate(value)) - today) / 86400000); }
  function dateClass(value) { const diff = dayDifference(value); return diff < 0 ? 'overdue' : diff === 0 ? 'today' : ''; }
  function dateCaption(value) { const diff = dayDifference(value); if (diff === null) return ''; if (diff < 0) return `${Math.abs(diff)} ${t('Overdue')}`; if (diff === 0) return t('Today'); return t('Upcoming'); }
  function isFollowupActive(customer) { return customer.status !== 'Completed' && Boolean(customer.nextFollowUp); }
  function phoneForWhatsApp(phone) { let digits = String(phone || '').replace(/\D/g, ''); if (digits.length === 10) digits = `91${digits}`; else if (digits.length === 11 && digits[0] === '0') digits = `91${digits.slice(1)}`; return digits; }
  function whatsappURL(phone, message = '') {
    const base = `https://wa.me/${phoneForWhatsApp(phone)}`;
    return message ? `${base}?text=${encodeURIComponent(message)}` : base;
  }
  function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2300); }
  let authMode = 'signin';
  function updateAuthMode() {
    const signup = authMode === 'signup';
    $('#auth-title').textContent = t(signup ? 'Create your Pinglo account' : 'Welcome back');
    $('#auth-description').textContent = t(signup ? 'Set up your business workspace.' : 'Sign in to continue.');
    $('#auth-submit').textContent = t(signup ? 'Create account' : 'Sign in');
    $('#auth-switch-copy').textContent = t(signup ? 'Already have an account?' : 'New to Pinglo?');
    $('#auth-mode-toggle').textContent = t(signup ? 'Sign in' : 'Create an account');
    $('#auth-forgot').hidden = signup;
    $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('#auth-status').textContent = t(supabase ? 'Sign in or create an account to sync your workspace.' : 'Connect Supabase to enable sign-in.');
  }
  function authNotConnected() {
    const message = supabaseInitError
      ? 'Supabase could not start. Check the project URL and publishable key.'
      : 'Connect Supabase to enable sign-in.';
    $('#auth-status').textContent = t(message);
  }
  function supabaseAuthError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    if (code.includes('user_already_exists') || message.includes('already registered')) return t('An account with this email already exists.');
    if (code.includes('invalid_credentials') || message.includes('invalid login credentials')) return t('The email or password is incorrect.');
    if (code.includes('invalid_email') || message.includes('invalid email')) return t('Enter a valid email address.');
    if (code.includes('weak_password') || message.includes('password should be')) return t('Choose a stronger password with at least 8 characters.');
    if (message.includes('email not confirmed')) return t('Confirm your email from the link we sent, then sign in.');
    if (message.includes('provider is not enabled') || message.includes('unsupported provider')) return t('Enable this sign-in provider in Supabase Authentication settings.');
    if (message.includes('redirect') && window.location.protocol === 'file:') return t('Open Pinglo through a website or local web address to use social sign-in.');
    if (message.includes('fetch') || message.includes('network')) return t('Could not connect. Check your internet connection and try again.');
    return error?.message || t('Sign-in failed. Check your details and try again.');
  }
  function authRedirectUrl() {
    if (!window.location.origin || window.location.protocol === 'file:') return '';
    return window.location.origin + window.location.pathname;
  }
  async function signInWithProvider(provider, statusMessage) {
    if (!supabase) { authNotConnected(); return; }
    const redirectTo = authRedirectUrl();
    if (!redirectTo) {
      $('#auth-status').textContent = t('Open Pinglo through a website or local web address to use social sign-in.');
      return;
    }
    $('#auth-status').textContent = t(statusMessage);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw error;
  }
  function resetLocalDataForDemo() {
    customers = demoCustomers();
    templates = templateDefaults.map(template => ({ ...template }));
    profile = { ...defaultProfile };
    cloudCustomerIds = new Set();
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customers));
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    renderProfile();
    renderAll();
  }
  function cloudTemplates(savedTemplates) {
    if (!Array.isArray(savedTemplates)) return templateDefaults.map(template => ({ ...template }));
    return templateDefaults.map(defaultTemplate => {
      const saved = savedTemplates.find(template => template?.id === defaultTemplate.id);
      return { ...defaultTemplate, text: typeof saved?.text === 'string' ? saved.text : defaultTemplate.text };
    });
  }
  async function loadCloudData(user) {
    cloudReady = false;
    const userId = user.id;
    const [profileResult, customerResult, templateResult] = await Promise.all([
      supabase.from('pinglo_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('pinglo_customers').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('pinglo_templates').select('*').eq('user_id', userId).order('sort_order', { ascending: true })
    ]);
    if (profileResult.error) throw profileResult.error;
    if (customerResult.error) throw customerResult.error;
    if (templateResult.error) throw templateResult.error;

    const account = profileResult.data || {};
    const remoteCustomers = customerResult.data || [];
    const remoteTemplates = templateResult.data || [];
    const savedLocalProfile = profile;
    const emailName = (user.email || '').split('@')[0];
    profile = {
      ownerName: account.owner_name || user.user_metadata?.display_name || (savedLocalProfile.ownerName !== defaultProfile.ownerName ? savedLocalProfile.ownerName : emailName) || 'Business owner',
      businessName: account.business_name || (savedLocalProfile.businessName !== defaultProfile.businessName ? savedLocalProfile.businessName : 'My Business')
    };
    templates = remoteTemplates.length
      ? cloudTemplates(remoteTemplates.map(template => ({ id: template.id, text: template.message })))
      : cloudTemplates(templates);

    if (remoteCustomers.length) {
      customers = remoteCustomers.map(customer => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        status: customer.status,
        nextFollowUp: customer.next_follow_up || '',
        notes: customer.notes || '',
        createdAt: customer.created_at
      }));
    } else {
      // Move non-demo records from the earlier browser-only version into this account.
      customers = customers.filter(customer => !String(customer.id).startsWith('demo-'));
    }
    cloudCustomerIds = new Set(remoteCustomers.map(customer => String(customer.id)));
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customers));
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    cloudReady = true;

    if (!profileResult.data || !remoteTemplates.length) await saveCloudAccountData();
    if (!remoteCustomers.length && customers.length) await saveCustomers();
    renderProfile();
    renderAll();
  }
  function showAuthScreen(message = '') {
    document.body.classList.add('auth-gated');
    authScreen.classList.remove('hidden');
    if (message) $('#auth-status').textContent = t(message);
  }
  async function handleAuthSession(session) {
    const user = session?.user || null;
    const previousUser = currentUser;
    if (!user) {
      currentUser = null;
      cloudReady = false;
      cloudCustomerIds = new Set();
      if (previousUser) resetLocalDataForDemo();
      let useDemo = false;
      try { useDemo = sessionStorage.getItem(AUTH_DEMO_KEY) === '1'; } catch {}
      if (useDemo) {
        authScreen.classList.add('hidden');
        document.body.classList.remove('auth-gated');
      } else showAuthScreen();
      return;
    }
    if (currentUser?.id === user.id && cloudReady) return;
    currentUser = user;
    try {
      await loadCloudData(user);
      try { sessionStorage.removeItem(AUTH_DEMO_KEY); } catch {}
      $('.auth-privacy').textContent = t('Your business data is synced to your private account.');
      authScreen.classList.add('hidden');
      document.body.classList.remove('auth-gated');
    } catch (error) {
      console.error('Pinglo Supabase data could not load', error);
      cloudReady = false;
      showAuthScreen('Sign-in worked, but Supabase storage is not ready. Check the setup guide and try again.');
    }
  }
  let authWorkQueue = Promise.resolve();
  function queueAuthSession(session) {
    authWorkQueue = authWorkQueue.then(() => handleAuthSession(session)).catch(error => {
      console.error('Pinglo Supabase authentication could not be restored', error);
      showAuthScreen('Could not connect to Supabase. Check your connection and try again.');
    });
  }
  function initAuthGate() {
    let demoSession = false;
    try { demoSession = sessionStorage.getItem(AUTH_DEMO_KEY) === '1'; } catch {}
    if (demoSession) {
      authScreen.classList.add('hidden');
      document.body.classList.remove('auth-gated');
    } else showAuthScreen();

    authForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!supabase) { authNotConnected(); return; }
      const email = $('#auth-email').value.trim();
      const password = $('#auth-password').value;
      const submit = $('#auth-submit');
      submit.disabled = true;
      $('#auth-status').textContent = t(authMode === 'signup' ? 'Creating your account…' : 'Signing in…');
      try {
        if (authMode === 'signup') {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: email.split('@')[0] } }
          });
          if (error) throw error;
          if (!data.session) {
            $('#auth-status').textContent = t('Account created. Check your email to confirm, then sign in.');
            authForm.reset();
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (error) {
        $('#auth-status').textContent = supabaseAuthError(error);
      } finally { submit.disabled = false; }
    });
    $('#auth-google').addEventListener('click', async () => {
      try { await signInWithProvider('google', 'Opening Google sign-in…'); }
      catch (error) { $('#auth-status').textContent = supabaseAuthError(error); }
    });
    $('#auth-apple').addEventListener('click', async () => {
      try { await signInWithProvider('apple', 'Opening Apple sign-in…'); }
      catch (error) { $('#auth-status').textContent = supabaseAuthError(error); }
    });
    $('#auth-forgot').addEventListener('click', async () => {
      if (!supabase) { authNotConnected(); return; }
      const email = $('#auth-email').value.trim();
      if (!email) { $('#auth-status').textContent = t('Enter your email address first.'); $('#auth-email').focus(); return; }
      const redirectTo = authRedirectUrl();
      if (!redirectTo) {
        $('#auth-status').textContent = t('Open Pinglo through a website or local web address to reset your password.');
        return;
      }
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        $('#auth-status').textContent = t('Password reset link sent. Check your email.');
      } catch (error) { $('#auth-status').textContent = supabaseAuthError(error); }
    });
    $('#auth-mode-toggle').addEventListener('click', () => {
      authMode = authMode === 'signin' ? 'signup' : 'signin';
      updateAuthMode();
    });
    $('#demo-sign-out').addEventListener('click', async () => {
      closeProfileMenu();
      try { sessionStorage.removeItem(AUTH_DEMO_KEY); } catch {}
      if (supabase && currentUser) {
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
        } catch (error) { showToast(supabaseAuthError(error)); }
      } else {
        showAuthScreen();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        $('#auth-email').focus();
      }
    });
    if (!supabase) {
      authNotConnected();
      return;
    }
    supabase.auth.onAuthStateChange((_event, session) => {
      // Defer database requests out of the auth callback to avoid blocking auth state changes.
      window.setTimeout(() => queueAuthSession(session), 0);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      queueAuthSession(data.session);
    }).catch(error => {
      console.error('Pinglo Supabase session could not load', error);
      showAuthScreen('Could not connect to Supabase. Check your connection and try again.');
    });
  }  function renderProfile() {
    const owner = String(profile.ownerName || defaultProfile.ownerName).trim() || defaultProfile.ownerName;
    const business = String(profile.businessName || defaultProfile.businessName).trim() || defaultProfile.businessName;
    $('#profile-business-name').textContent = business;
    $('#profile-owner-label').textContent = t('Owner · {name}', { name: owner });
    $('#profile-avatar').textContent = initials(owner);
    $('#mobile-profile-button').textContent = initials(owner);
    $('#profile-menu-business').textContent = business;
    $('#profile-menu-owner').textContent = t('{name} · Business owner', { name: owner });
    $('#welcome-title').innerHTML = `${escapeHTML(t('Welcome back, {name}', { name: owner }))} <span class="wave">✳</span>`;
  }
  const profileHome = $('.profile');
  function closeProfileMenu() {
    profileMenu.classList.add('hidden');
    $('#profile-menu-button').setAttribute('aria-expanded', 'false');
    $('#mobile-profile-button').setAttribute('aria-expanded', 'false');
  }
  function toggleProfileMenu(event) {
    const fromMobile = event?.currentTarget?.id === 'mobile-profile-button';
    const shouldOpen = profileMenu.classList.contains('hidden');
    // The sidebar is hidden on mobile, so lift the menu out to the body when opened from the top bar.
    if (shouldOpen) {
      const host = fromMobile ? document.body : profileHome;
      if (profileMenu.parentElement !== host) host.appendChild(profileMenu);
      profileMenu.classList.toggle('profile-menu-mobile', fromMobile);
    }
    profileMenu.classList.toggle('hidden', !shouldOpen);
    $('#profile-menu-button').setAttribute('aria-expanded', String(shouldOpen && !fromMobile));
    $('#mobile-profile-button').setAttribute('aria-expanded', String(shouldOpen && fromMobile));
  }
  function openProfileModal() {
    closeProfileMenu();
    $('#profile-form-owner').value = profile.ownerName;
    $('#profile-form-business').value = profile.businessName;
    profileModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#profile-form-owner').focus(), 25);
  }
  function closeProfileModal() {
    profileModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
  function saveProfile(event) {
    event.preventDefault();
    profile = {
      ownerName: $('#profile-form-owner').value.trim(),
      businessName: $('#profile-form-business').value.trim()
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    saveCloudAccountData();
    renderProfile();
    closeProfileModal();
    showToast(t('Business profile saved'));
  }
  function customerById(id) { return customers.find(c => c.id === id); }
  function countFor(filter) {
    if (filter === 'new') return customers.filter(c => c.status === 'New').length;
    if (filter === 'active') return customers.filter(c => ['Contacted', 'Interested', 'Confirmed'].includes(c.status)).length;
    if (filter === 'overdue') return customers.filter(c => isFollowupActive(c) && dayDifference(c.nextFollowUp) < 0).length;
    if (filter === 'today') return customers.filter(c => isFollowupActive(c) && dayDifference(c.nextFollowUp) === 0).length;
    if (filter === 'upcoming') return customers.filter(c => isFollowupActive(c) && dayDifference(c.nextFollowUp) > 0).length;
    return customers.filter(isFollowupActive).length;
  }
  function renderStats() {
    $('#stat-today').textContent = countFor('today');
    $('#stat-overdue').textContent = countFor('overdue');
    $('#stat-leads').textContent = countFor('new');
    $('#stat-active').textContent = countFor('active');
    $('#nav-customer-count').textContent = customers.length;
    $('#customer-total').textContent = customers.length;
    $('#count-all').textContent = countFor('all');
    $('#count-overdue').textContent = countFor('overdue');
    $('#count-today').textContent = countFor('today');
    $('#count-upcoming').textContent = countFor('upcoming');
    $('#count-new').textContent = countFor('new');
    $('#count-active').textContent = countFor('active');
  }
  function dueCustomers(filter, query = '') {
    const needle = query.trim().toLocaleLowerCase();
    return customers.filter(c => {
      if (filter === 'new') {
        if (c.status !== 'New') return false;
      } else if (filter === 'active') {
        if (!['Contacted', 'Interested', 'Confirmed'].includes(c.status)) return false;
      } else {
        if (!isFollowupActive(c)) return false;
        const diff = dayDifference(c.nextFollowUp);
        if (filter === 'overdue' && diff >= 0) return false;
        if (filter === 'today' && diff !== 0) return false;
        if (filter === 'upcoming' && diff <= 0) return false;
      }
      if (needle && !`${c.name} ${c.phone} ${c.notes}`.toLocaleLowerCase().includes(needle)) return false;
      return true;
    }).sort((a, b) => String(a.nextFollowUp || '').localeCompare(String(b.nextFollowUp || '')) || a.name.localeCompare(b.name));
  }
  function followupRow(c) {
    const cls = dateClass(c.nextFollowUp);
    return `<article class="followup-row" data-id="${escapeHTML(c.id)}">
      <div class="person-cell">${avatarHTML(c.name)}<div><span class="person-name">${escapeHTML(c.name)}</span><span class="person-meta">${isPhoneName(c) ? escapeHTML(t('Phone contact')) : escapeHTML(c.phone)}</span></div></div>
      <div class="followup-note" title="${escapeHTML(c.notes || '')}">${escapeHTML(c.notes || t('No notes yet'))}</div>
      <div class="date-cell ${cls}">${escapeHTML(prettyDate(c.nextFollowUp))}<span class="date-caption">${escapeHTML(dateCaption(c.nextFollowUp))}</span></div>
      <div class="row-actions"><span class="status-pill status-${escapeHTML(c.status)}">${escapeHTML(t(c.status))}</span><button class="done-button" data-action="done" data-id="${escapeHTML(c.id)}" aria-label="${escapeHTML(t('Mark {name} follow-up complete', { name: c.name }))}" title="${escapeHTML(t('Mark follow-up complete'))}">✓</button><a class="whatsapp-button" href="${escapeHTML(whatsappURL(c.phone))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(t('WhatsApp {name}', { name: c.name }))}" title="${escapeHTML(t('Open WhatsApp'))}">WA</a><button class="edit-button" data-action="edit" data-id="${escapeHTML(c.id)}" aria-label="${escapeHTML(t('Edit {name}', { name: c.name }))}" title="${escapeHTML(t('Edit customer'))}">✎</button></div>
    </article>`;
  }
  function renderFollowups() {
    const matches = dueCustomers(activeFollowupFilter, $('#dashboard-search').value);
    const headings = { all: 'Follow-ups', overdue: 'Overdue follow-ups', today: "Today's follow-ups", upcoming: 'Upcoming follow-ups', new: 'New leads', active: 'Active customers' };
    const emptyStates = {
      all: ['All caught up', 'No follow-ups in this view. Enjoy the breathing room.'],
      overdue: ['No overdue follow-ups', "You're all caught up on late follow-ups."],
      today: ['No follow-ups due today', 'Nothing needs your attention today.'],
      upcoming: ['No upcoming follow-ups', 'There are no future follow-ups scheduled.'],
      new: ['No new leads yet', 'New enquiries will appear here.'],
      active: ['No active customers yet', 'Customers you have contacted will appear here.']
    };
    $('#dashboard-list-heading').textContent = t(headings[activeFollowupFilter] || headings.all);
    $('#dashboard-empty-title').textContent = t(emptyStates[activeFollowupFilter]?.[0] || emptyStates.all[0]);
    $('#dashboard-empty-copy').textContent = t(emptyStates[activeFollowupFilter]?.[1] || emptyStates.all[1]);
    dashboardList.innerHTML = matches.map(followupRow).join('');
    $('#dashboard-empty').classList.toggle('hidden', matches.length > 0);
    dashboardList.classList.toggle('hidden', matches.length === 0);
  }
  function statusOptions(selected) { return statuses.map(s => `<option value="${s}"${s === selected ? ' selected' : ''}>${escapeHTML(t(s))}</option>`).join(''); }
  function renderCustomers() {
    const query = $('#customer-search').value.trim().toLocaleLowerCase();
    const filter = $('#status-filter').value;
    const matches = customers.filter(c => {
      const text = `${c.name} ${c.phone} ${c.notes}`.toLocaleLowerCase();
      const statusMatch = filter === 'all' || (filter === 'active' ? ['Contacted', 'Interested', 'Confirmed'].includes(c.status) : c.status === filter);
      return statusMatch && (!query || text.includes(query));
    }).sort((a, b) => {
      if (a.status === 'Completed' && b.status !== 'Completed') return 1;
      if (b.status === 'Completed' && a.status !== 'Completed') return -1;
      if (isFollowupActive(a) && isFollowupActive(b)) return a.nextFollowUp.localeCompare(b.nextFollowUp);
      if (isFollowupActive(a)) return -1;
      if (isFollowupActive(b)) return 1;
      return a.name.localeCompare(b.name);
    });
    customerList.innerHTML = matches.map(c => `<article class="customer-card" data-id="${escapeHTML(c.id)}">
      <div class="person-cell">${avatarHTML(c.name)}<div><span class="person-name">${escapeHTML(c.name)}</span><span class="person-meta">${c.createdAt ? `${escapeHTML(t('Added'))} ${escapeHTML(prettyDate(c.createdAt))}` : escapeHTML(t('Customer profile'))}</span></div></div>
      <a class="customer-phone" href="${escapeHTML(whatsappURL(c.phone))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(t('Open WhatsApp for {name}', { name: c.name }))}">${isPhoneName(c) ? `${escapeHTML(t('Open WhatsApp'))} ↗` : escapeHTML(c.phone)}</a>
      <div class="customer-followup">${isFollowupActive(c) ? escapeHTML(prettyDate(c.nextFollowUp)) : '—'}<small>${isFollowupActive(c) ? escapeHTML(dateCaption(c.nextFollowUp)) : c.status === 'Completed' ? escapeHTML(t('All done')) : escapeHTML(t('No date set'))}</small></div>
      <div class="customer-buttons"><select class="status-select" data-action="status" data-id="${escapeHTML(c.id)}" aria-label="${escapeHTML(t('Status for {name}', { name: c.name }))}">${statusOptions(c.status)}</select><button class="edit-button" data-action="edit" data-id="${escapeHTML(c.id)}" aria-label="${escapeHTML(t('Edit {name}', { name: c.name }))}" title="${escapeHTML(t('Edit customer'))}">✎</button></div>
      <div class="customer-notes">${escapeHTML(c.notes || t('No notes yet'))}</div>
    </article>`).join('');
    $('#customer-empty').classList.toggle('hidden', matches.length > 0);
    customerList.classList.toggle('hidden', matches.length === 0);
  }
  function renderTemplates() {
    const translatedNames = { 'follow-up': 'Follow-up', 'order-ready': 'Order Ready', 'payment-reminder': 'Payment Reminder', 'appointment-reminder': 'Appointment Reminder', 'thank-you': 'Thank You' };
    $('#template-grid').innerHTML = templates.map((template, index) => {
      const name = t(translatedNames[template.id] || template.name);
      return `<article class="template-card" data-template-index="${index}"><div class="template-card-head"><span class="template-title"><span class="template-icon">${escapeHTML(template.icon)}</span>${escapeHTML(name)}</span><button class="button-primary template-send" type="button" data-send-template="${index}">${escapeHTML(t('Send message'))}</button></div><textarea data-template-text="${index}" aria-label="${escapeHTML(t('{name} message', { name }))}" maxlength="600">${escapeHTML(template.text)}</textarea><div class="template-hint"><span>${escapeHTML(t('Use {{name}} to personalize'))}</span><span class="char-count">${template.text.length}/600</span></div></article>`;
    }).join('');
  }
  function renderAll() { renderStats(); renderFollowups(); renderCustomers(); renderProfile(); }
  function navigate(page) {
    $$('.page').forEach(el => el.classList.toggle('active-page', el.id === `page-${page}`));
    $$('.nav-link, .mobile-nav-link').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    $('#crumb-current').textContent = t(({ dashboard: 'Overview', customers: 'Customers', templates: 'Message templates' })[page]);
    if (page === 'customers') renderCustomers();
    if (page === 'templates') renderTemplates();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openModal(customer = null) {
    form.reset();
    $('#customer-id').value = customer ? customer.id : '';
    $('#modal-title').textContent = customer ? t('Edit customer') : t('Add customer');
    $('#save-customer').textContent = customer ? t('Save changes') : t('Save customer');
    $('#form-name').value = customer?.name || '';
    $('#form-phone').value = customer?.phone?.replace(/^\+91\s*/, '') || '';
    $('#form-status').value = customer?.status || 'New';
    $('#form-date').value = customer?.nextFollowUp || '';
    $('#form-notes').value = customer?.notes || '';
    $('#delete-customer').classList.toggle('hidden', !customer);
    $('#delete-confirmation').classList.add('hidden');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#form-name').focus(), 25);
  }
  function closeModal() { modal.classList.add('hidden'); $('#delete-confirmation').classList.add('hidden'); document.body.style.overflow = ''; }
  function currentTemplateText(index) {
    const editor = $(`[data-template-text="${index}"]`);
    return editor ? editor.value : (templates[index]?.text || '');
  }
  function personalizeMessage(text, customer) {
    return String(text || '').replace(/\{\{\s*name\s*\}\}/gi, customer?.name || '');
  }
  function renderMessageDraft() {
    const customer = customerById($('#message-recipient').value);
    const body = $('#message-body');
    const submit = $('#open-whatsapp-message');
    const hasCustomer = Boolean(customer);
    const number = phoneForWhatsApp(customer?.phone);
    const validNumber = number.length >= 7 && number.length <= 15;
    body.disabled = !hasCustomer;
    body.value = hasCustomer ? personalizeMessage(currentTemplateText(activeMessageTemplateIndex), customer) : '';
    updateWhatsAppMessageLink();
    $('#message-error').classList.toggle('hidden', !hasCustomer || validNumber);
  }
  function updateWhatsAppMessageLink() {
    const customer = customerById($('#message-recipient').value);
    const message = $('#message-body').value.trim();
    const link = $('#open-whatsapp-message');
    const number = phoneForWhatsApp(customer?.phone);
    const enabled = Boolean(customer && message && number.length >= 7 && number.length <= 15);
    link.setAttribute('aria-disabled', String(!enabled));
    link.tabIndex = enabled ? 0 : -1;
    if (enabled) link.href = whatsappURL(customer.phone, message);
    else link.removeAttribute('href');
  }
  function openMessageModal(templateIndex) {
    if (!customers.length) { showToast(t('Add a customer first to send a message.')); return; }
    activeMessageTemplateIndex = Math.max(0, Math.min(templates.length - 1, Number(templateIndex) || 0));
    const recipient = $('#message-recipient');
    const sortedCustomers = [...customers].sort((a, b) => a.name.localeCompare(b.name));
    recipient.innerHTML = `<option value="">${escapeHTML(t('Choose a customer'))}</option>${sortedCustomers.map(customer => `<option value="${escapeHTML(customer.id)}">${escapeHTML(customer.name)} · ${escapeHTML(customer.phone)}</option>`).join('')}`;
    renderMessageDraft();
    messageModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => recipient.focus(), 25);
  }
  function closeMessageModal() {
    messageModal.classList.add('hidden');
    messageForm.reset();
    document.body.style.overflow = '';
  }
  function normalizePhone(raw) {
    const cleaned = String(raw).trim();
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
    if (digits.length === 11 && digits.startsWith('0')) return `+91 ${digits.slice(1, 6)} ${digits.slice(6)}`;
    const countryCode = cleaned.startsWith('+') ? '+' : '+';
    return `${countryCode}${digits}`;
  }
  function addOrUpdateCustomer(event) {
    event.preventDefault();
    const id = $('#customer-id').value;
    const phoneInput = $('#form-phone').value.trim();
    if (phoneInput.replace(/\D/g, '').length < 10) { $('#form-phone').setCustomValidity(t('Enter a phone number with at least 10 digits.')); $('#form-phone').reportValidity(); $('#form-phone').setCustomValidity(''); return; }
    const previous = id ? customerById(id) : null;
    const phone = normalizePhone(phoneInput);
    const name = $('#form-name').value.trim() || phone;
    const customer = { id: id || `customer-${Date.now()}`, name, phone, status: $('#form-status').value, nextFollowUp: $('#form-date').value, notes: $('#form-notes').value.trim(), createdAt: previous?.createdAt || localDateString(today) };
    if (customer.status === 'Completed') customer.nextFollowUp = '';
    if (previous) customers = customers.map(c => c.id === id ? customer : c); else customers.unshift(customer);
    saveCustomers(); closeModal(); renderAll(); showToast(t(previous ? 'Customer details updated' : 'Customer added to your list'));
  }
  function markDone(id) {
    const customer = customerById(id); if (!customer) return;
    customer.status = 'Completed'; customer.nextFollowUp = '';
    saveCustomers(); renderAll(); showToast(t('{name} follow-up marked complete', { name: customer.name }));
  }
  function deleteCustomer(id) {
    const customer = customerById(id); if (!customer) return;
    customers = customers.filter(c => c.id !== id);
    saveCustomers(); closeModal(); renderAll(); showToast(t('{name} deleted', { name: customer.name }));
  }
  function showDeleteConfirmation() {
    const customer = customerById($('#customer-id').value); if (!customer) return;
    $('#delete-confirm-title').textContent = t('Delete {name}?', { name: customer.name });
    $('#delete-confirmation').classList.remove('hidden');
    $('#delete-customer').classList.add('hidden');
    $('#cancel-delete').focus();
  }
  function cancelDeletePrompt() {
    $('#delete-confirmation').classList.add('hidden');
    $('#delete-customer').classList.toggle('hidden', !customerById($('#customer-id').value));
    $('#delete-customer').focus();
  }
  function setStatus(id, status) {
    const customer = customerById(id); if (!customer) return;
    customer.status = status;
    if (status === 'Completed') customer.nextFollowUp = '';
    saveCustomers(); renderAll(); showToast(t('Customer status updated'));
  }
  function setDashboardFilter(filter) {
    activeFollowupFilter = filter;
    $$('[data-followup-filter]').forEach(btn => btn.classList.toggle('active', btn.dataset.followupFilter === filter));
    renderFollowups();
  }

  captureStaticContent();
  initAuthGate();
  $('#customer-add').addEventListener('click', () => openModal());
  $('#top-add').addEventListener('click', () => openModal());
  $('#mobile-add').addEventListener('click', () => openModal());
  $('#empty-add').addEventListener('click', () => openModal());
  $('#customer-empty-add').addEventListener('click', () => openModal());
  $('#close-modal').addEventListener('click', closeModal);
  $('#cancel-modal').addEventListener('click', closeModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  $('#close-message-modal').addEventListener('click', closeMessageModal);
  $('#cancel-message').addEventListener('click', closeMessageModal);
  messageModal.addEventListener('click', event => { if (event.target === messageModal) closeMessageModal(); });
  $('#message-recipient').addEventListener('change', renderMessageDraft);
  $('#message-body').addEventListener('input', updateWhatsAppMessageLink);
  $('#open-whatsapp-message').addEventListener('click', event => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!messageModal.classList.contains('hidden')) closeMessageModal();
    else if (!profileModal.classList.contains('hidden')) closeProfileModal();
    else if (!$('#delete-confirmation').classList.contains('hidden')) cancelDeletePrompt();
    else if (!modal.classList.contains('hidden')) closeModal();
    else closeProfileMenu();
  });
  document.addEventListener('click', event => { if (!event.target.closest('.profile, #profile-menu, #mobile-profile-button')) closeProfileMenu(); });
  $('#mobile-profile-button').addEventListener('click', toggleProfileMenu);
  form.addEventListener('submit', addOrUpdateCustomer);
  $('#delete-customer').addEventListener('click', showDeleteConfirmation);
  $('#cancel-delete').addEventListener('click', cancelDeletePrompt);
  $('#confirm-delete').addEventListener('click', () => deleteCustomer($('#customer-id').value));
  profileForm.addEventListener('submit', saveProfile);
  $('#profile-menu-button').addEventListener('click', toggleProfileMenu);
  $('#edit-profile-button').addEventListener('click', openProfileModal);
  $$('.theme-choice').forEach(button => button.addEventListener('click', () => {
    themeMode = button.dataset.theme;
    localStorage.setItem(THEME_KEY, themeMode);
    applyThemeMode();
  }));
  $('#language-select').addEventListener('change', event => {
    languageCode = localeData.languages.some(item => item.code === event.target.value) ? event.target.value : 'en';
    localStorage.setItem(LANGUAGE_KEY, languageCode);
    applyLocale();
    renderAll();
    if ($('#page-templates').classList.contains('active-page')) renderTemplates();
  });
  if (systemThemeQuery.addEventListener) systemThemeQuery.addEventListener('change', () => { if (themeMode === 'system') applyThemeMode(); });
  else systemThemeQuery.addListener(() => { if (themeMode === 'system') applyThemeMode(); });
  $('#close-profile-modal').addEventListener('click', closeProfileModal);
  $('#cancel-profile-modal').addEventListener('click', closeProfileModal);
  profileModal.addEventListener('click', event => { if (event.target === profileModal) closeProfileModal(); });
  $('#dashboard-search').addEventListener('input', renderFollowups);
  $('#customer-search').addEventListener('input', renderCustomers);
  $('#status-filter').addEventListener('change', renderCustomers);
  $('#see-all-followups').addEventListener('click', () => navigate('customers'));
  $('#help-button').addEventListener('click', () => showToast(t(cloudReady ? 'Your customer list syncs to your private account.' : 'Your customer list is saved on this device.')));
  $$('.nav-link, .mobile-nav-link').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
  $$('[data-followup-filter]').forEach(button => button.addEventListener('click', () => setDashboardFilter(button.dataset.followupFilter)));
  $$('.stat-card').forEach(card => card.addEventListener('click', () => {
    $('#dashboard-search').value = '';
    setDashboardFilter(card.dataset.filter);
    $('#dashboard-list-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  dashboardList.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    if (button.dataset.action === 'edit') openModal(customerById(button.dataset.id));
    if (button.dataset.action === 'done') markDone(button.dataset.id);
  });
  customerList.addEventListener('click', event => {
    const button = event.target.closest('[data-action="edit"]'); if (button) openModal(customerById(button.dataset.id));
  });
  customerList.addEventListener('change', event => {
    const select = event.target.closest('[data-action="status"]'); if (select) setStatus(select.dataset.id, select.value);
  });
  $('#template-grid').addEventListener('input', event => {
    const textarea = event.target.closest('[data-template-text]'); if (!textarea) return;
    $('.char-count', textarea.closest('.template-card')).textContent = `${textarea.value.length}/600`;
    $('#template-saved').textContent = t('Unsaved changes'); $('#template-saved').classList.remove('just-saved');
  });
  $('#template-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-send-template]');
    if (button) openMessageModal(button.dataset.sendTemplate);
  });
  $('#save-templates').addEventListener('click', () => {
    templates = templates.map((template, index) => ({ ...template, text: $(`[data-template-text="${index}"]`).value.trim() }));
    saveTemplates(); $('#template-saved').textContent = t(cloudReady ? 'Saved to your account ✓' : 'Saved on this device ✓'); showToast(t('Message templates saved'));
  });
  $('#reset-templates').addEventListener('click', () => {
    if (!window.confirm(t('Restore all five original message templates? Your edits will be replaced.'))) return;
    templates = templateDefaults.map(t => ({ ...t })); saveTemplates(); renderTemplates(); $('#template-saved').textContent = t('Original messages restored');
  });

  applyLocale();
  applyThemeMode();
  renderAll();
})();
