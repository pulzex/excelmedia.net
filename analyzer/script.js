/* ============================================
   EXCELMEDIA ANALYZER - SCRIPT
   Subscription-based with IP rate limiting
   ============================================ */

(function () {
    'use strict';

    // === STORAGE KEYS ===
    const STORAGE_EMAIL = 'em_analyzer_email';
    const STORAGE_PLAN = 'em_analyzer_plan';
    const STORAGE_REMAINING = 'em_analyzer_remaining';

    // === AUTH STATE ===
    function getSubscriber() {
        const email = localStorage.getItem(STORAGE_EMAIL);
        if (!email) return null;
        return {
            email,
            plan: localStorage.getItem(STORAGE_PLAN) || 'starter',
            remaining: parseInt(localStorage.getItem(STORAGE_REMAINING) || '0', 10),
        };
    }
    function setSubscriber(email, plan, remaining) {
        localStorage.setItem(STORAGE_EMAIL, email);
        localStorage.setItem(STORAGE_PLAN, plan);
        localStorage.setItem(STORAGE_REMAINING, String(remaining));
    }
    function getAdminToken() {
        return localStorage.getItem('em_admin_token');
    }

    // === FREE USE TRACKING ===
    const FREE_USE_KEY = 'em_analyzer_used';
    function hasUsedFreeAnalysis() {
        return localStorage.getItem(FREE_USE_KEY) === '1';
    }
    function markFreeAnalysisUsed() {
        localStorage.setItem(FREE_USE_KEY, '1');
    }

    // === STATE ===
    let currentStep = 1;
    const totalSteps = 6;
    const answers = { issue: '', goal: '', audience: '', product: '', url: '', notWorking: '' };

    // === DOM REFS ===
    const heroSection = document.querySelector('.hero');
    const formSection = document.getElementById('formSection');
    const loadingSection = document.getElementById('loadingSection');
    const resultsSection = document.getElementById('resultsSection');
    const paywallSection = document.getElementById('paywallSection');
    const progressFill = document.getElementById('progressFill');
    const stepIndicator = document.getElementById('stepIndicator');
    const backBtn = document.getElementById('backBtn');
    const startBtn = document.getElementById('startBtn');
    const analyzeAgainBtn = document.getElementById('analyzeAgainBtn');
    const resultUpgradeBtn = document.getElementById('resultUpgradeBtn');
    const usesBadge = document.getElementById('usesBadge');
    const navLoginBtn = document.getElementById('navLoginBtn');
    const navUser = document.getElementById('navUser');
    const loginModal = document.getElementById('loginModal');

    // === HERO FADE-IN ===
    const heroFades = document.querySelectorAll('.hero-fade');
    heroFades.forEach((el, i) => { el.style.transitionDelay = `${i * 0.12}s`; });
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            heroFades.forEach(el => el.classList.add('loaded'));
        });
    });

    // === CHECK FOR STRIPE REDIRECT ===
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');
    if (sessionId) {
        window.history.replaceState({}, '', window.location.pathname);
        verifySession(sessionId);
    } else if (canceled === 'true') {
        window.history.replaceState({}, '', window.location.pathname);
        showErrorToast('Checkout canceled', 'No worries â you can subscribe anytime.');
    }

    updateUI();

    // === UI UPDATE ===
    function updateUI() {
        const sub = getSubscriber();
        const isAdmin = !!getAdminToken();
        if (isAdmin) {
            usesBadge.style.display = 'none';
            navLoginBtn.style.display = 'none';
            navUser.style.display = 'none';
        } else if (sub) {
            usesBadge.textContent = `${sub.remaining} credits`;
            usesBadge.style.display = '';
            navLoginBtn.style.display = 'none';
            navUser.style.display = '';
            navUser.textContent = sub.email;
        } else {
            const used = hasUsedFreeAnalysis();
            usesBadge.textContent = used ? 'Free trial used' : '1 free analysis';
            usesBadge.style.display = '';
            navLoginBtn.style.display = '';
            navUser.style.display = 'none';
        }
    }

    // === START BUTTON ===
    startBtn.addEventListener('click', () => {
        // If no subscription and already used free analysis, go to paywall
        const sub = getSubscriber();
        const isAdmin = !!getAdminToken();
        if (!isAdmin && !sub && hasUsedFreeAnalysis()) {
            showPaywall();
            return;
        }
        heroSection.style.display = 'none';
        formSection.classList.add('active');
        updateStep();
    });

    // === OPTION BUTTONS (Step 1 & 2) ===
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const step = btn.closest('.form-step');
            step.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const stepNum = parseInt(step.dataset.step);
            if (stepNum === 1) answers.issue = btn.dataset.value;
            if (stepNum === 2) answers.goal = btn.dataset.value;
            setTimeout(() => goToStep(stepNum + 1), 300);
        });
    });

    // === TEXT STEP BUTTONS ===
    document.getElementById('step3Next').addEventListener('click', () => {
        const el = document.getElementById('audience');
        if (!el.value.trim()) { showFieldError(el, 'Please describe your target audience'); return; }
        answers.audience = el.value.trim();
        goToStep(4);
    });

    document.getElementById('step4Next').addEventListener('click', () => {
        const el = document.getElementById('product');
        if (!el.value.trim()) { showFieldError(el, 'Please describe what you sell'); return; }
        answers.product = el.value.trim();
        goToStep(5);
    });

    document.getElementById('step5Next').addEventListener('click', () => {
        const el = document.getElementById('websiteUrl');
        const url = el.value.trim();
        if (!url) { showFieldError(el, 'Please enter your website URL'); return; }
        if (!isValidUrl(url)) { showFieldError(el, 'Please enter a valid URL (e.g. https://yoursite.com)'); return; }
        answers.url = url;
        goToStep(6);
    });

    document.getElementById('submitBtn').addEventListener('click', () => {
        answers.notWorking = document.getElementById('notWorking').value.trim();
        runAnalysis();
    });

    // === BACK BUTTON ===
    backBtn.addEventListener('click', () => {
        if (currentStep > 1) goToStep(currentStep - 1);
    });

    // === ANALYZE AGAIN ===
    analyzeAgainBtn.addEventListener('click', () => {
        // If no subscription and already used free analysis, go to paywall
        const sub = getSubscriber();
        const isAdmin = !!getAdminToken();
        if (!isAdmin && !sub && hasUsedFreeAnalysis()) {
            showPaywall();
            return;
        }
        hideAllSections();
        formSection.classList.add('active');
        currentStep = 1;
        updateStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // === UPGRADE FROM RESULTS ===
    if (resultUpgradeBtn) {
        resultUpgradeBtn.addEventListener('click', () => {
            showPaywall();
        });
    }

    // === NAV PRICING LINK ===
    document.getElementById('navPricingBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showPaywall();
    });

    // === FULLSCREEN OPEN/CLOSE ===
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
        const overlay = document.getElementById('fullscreenOverlay');
        const fsFrame = document.getElementById('fullscreenFrame');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (window._previewMode === 'original' && window._previewOriginalHtml) {
            fsFrame.srcdoc = window._previewOriginalHtml;
        } else if (window._previewImprovedHtml) {
            fsFrame.srcdoc = window._previewImprovedHtml;
        }
    });
    document.getElementById('fullscreenCloseBtn').addEventListener('click', () => {
        document.getElementById('fullscreenOverlay').classList.remove('active');
        document.body.style.overflow = '';
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('fullscreenOverlay').classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // === PRICING BUTTONS ===
    document.querySelectorAll('.pricing-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const plan = btn.dataset.plan;
            btn.disabled = true;
            btn.textContent = 'Redirecting...';
            try {
                const res = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plan }),
                });
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                } else {
                    showErrorToast('Checkout Error', data.error || 'Failed to start checkout');
                    btn.disabled = false;
                    btn.textContent = `Get ${plan.charAt(0).toUpperCase() + plan.slice(1)} â`;
                }
            } catch (err) {
                showErrorToast('Checkout Error', err.message);
                btn.disabled = false;
                btn.textContent = `Get ${plan.charAt(0).toUpperCase() + plan.slice(1)} â`;
            }
        });
    });

    // === LOGIN MODAL ===
    navLoginBtn.addEventListener('click', () => openLoginModal());
    document.getElementById('paywallLoginBtn').addEventListener('click', () => openLoginModal());
    document.getElementById('loginModalClose').addEventListener('click', () => closeLoginModal());
    loginModal.addEventListener('click', (e) => { if (e.target === loginModal) closeLoginModal(); });

    document.getElementById('loginSubmitBtn').addEventListener('click', async () => {
        const emailEl = document.getElementById('loginEmail');
        const email = emailEl.value.trim().toLowerCase();
        if (!email || !email.includes('@')) {
            document.getElementById('loginError').textContent = 'Enter a valid email';
            return;
        }

        const btn = document.getElementById('loginSubmitBtn');
        btn.disabled = true;
        btn.textContent = 'Verifying...';
        document.getElementById('loginError').textContent = '';

        try {
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();

            if (data.valid) {
                setSubscriber(data.email, data.plan, data.remaining);
                closeLoginModal();
                updateUI();
                showSuccessToast('Welcome back!', `${data.remaining} credits remaining on your ${data.plan} plan.`);
                if (paywallSection.classList.contains('active')) {
                    hideAllSections();
                    heroSection.style.display = '';
                }
            } else {
                document.getElementById('loginError').textContent = data.error || 'No active subscription found';
            }
        } catch (err) {
            document.getElementById('loginError').textContent = 'Verification failed: ' + err.message;
        }

        btn.disabled = false;
        btn.textContent = 'Verify Subscription â';
    });

    // === VERIFY SESSION (post-checkout redirect) ===
    async function verifySession(sid) {
        try {
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sid }),
            });
            const data = await res.json();
            if (data.valid) {
                setSubscriber(data.email, data.plan, data.remaining);
                updateUI();
                const planName = data.plan.charAt(0).toUpperCase() + data.plan.slice(1);
                showSuccessToast('Subscription Active!', `Welcome to ${planName}. You have ${data.remaining} credits ready.`);
            } else {
                showErrorToast('Verification failed', data.error || 'Could not verify your subscription.');
            }
        } catch {
            showErrorToast('Verification failed', 'Please try logging in with your email.');
        }
    }

    // === NAVIGATION ===
    function goToStep(step) {
        if (step < 1 || step > totalSteps) return;
        currentStep = step;
        updateStep();
    }

    function updateStep() {
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
        const active = document.querySelector(`.form-step[data-step="${currentStep}"]`);
        if (active) active.classList.add('active');
        progressFill.style.width = ((currentStep / totalSteps) * 100) + '%';
        stepIndicator.textContent = `Step ${currentStep} of ${totalSteps}`;
        backBtn.style.display = currentStep > 1 ? 'block' : 'none';
        const field = active?.querySelector('textarea, input');
        if (field) setTimeout(() => field.focus(), 100);
    }

    function showPaywall() {
        hideAllSections();
        paywallSection.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function hideAllSections() {
        heroSection.style.display = 'none';
        formSection.classList.remove('active');
        loadingSection.classList.remove('active');
        resultsSection.classList.remove('active');
        resultsSection.style.display = 'none';
        paywallSection.classList.remove('active');
    }

    function openLoginModal() { loginModal.classList.add('active'); }
    function closeLoginModal() { loginModal.classList.remove('active'); document.getElementById('loginError').textContent = ''; }

    function showFieldError(el, msg) {
        el.classList.add('error');
        let existing = el.parentElement.querySelector('.error-msg');
        if (!existing) {
            existing = document.createElement('div');
            existing.className = 'error-msg';
            el.parentElement.insertBefore(existing, el.nextSibling);
        }
        existing.textContent = msg;
        el.addEventListener('input', function handler() {
            el.classList.remove('error');
            if (existing) existing.remove();
            el.removeEventListener('input', handler);
        }, { once: true });
    }

    function isValidUrl(str) {
        try {
            const url = new URL(str.startsWith('http') ? str : 'https://' + str);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch { return false; }
    }

    // === RUN ANALYSIS ===
    async function runAnalysis() {
        if (!answers.url.startsWith('http')) answers.url = 'https://' + answers.url;

        formSection.classList.remove('active');
        loadingSection.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        animateLoadingSteps();

        const body = { ...answers };
        const sub = getSubscriber();
        if (sub) body.email = sub.email;

        const headers = { 'Content-Type': 'application/json' };
        const adminToken = getAdminToken();
        if (adminToken) headers['X-Admin-Token'] = adminToken;

        // 60-second timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: 'Server error' }));
                const e = new Error(errData.error || 'Analysis failed');
                if (errData.requireUpgrade) e.requireUpgrade = true;
                throw e;
            }

            const data = await res.json();

            if (sub) {
                const newRemaining = Math.max(0, sub.remaining - 1);
                setSubscriber(sub.email, sub.plan, newRemaining);
            } else if (!getAdminToken()) {
                // Mark free analysis as used for non-subscribers
                markFreeAnalysisUsed();
            }
            updateUI();

            loadingSection.classList.remove('active');
            await displayResults(data);

        } catch (err) {
            clearTimeout(timeout);
            if (window._loadingInterval) clearInterval(window._loadingInterval);
            loadingSection.classList.remove('active');

            // If server says upgrade required, show paywall
            if (err.requireUpgrade) {
                markFreeAnalysisUsed();
                showPaywall();
                return;
            }

            const msg = err.name === 'AbortError'
                ? 'Analysis timed out. The website may be too slow to fetch. Please try again.'
                : (err.message || 'Please try again.');

            showErrorWithRetry('Analysis Failed', msg);
        }
    }

    function showErrorWithRetry(title, msg) {
        hideAllSections();
        formSection.classList.add('active');
        showErrorToast(title, msg);
        // Show a retry button in the current step
        let retryBar = document.getElementById('retryBar');
        if (!retryBar) {
            retryBar = document.createElement('div');
            retryBar.id = 'retryBar';
            retryBar.style.cssText = 'text-align:center;padding:16px;';
            retryBar.innerHTML = '<button id="retryBtn" style="padding:10px 24px;background:#00ff88;color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">Retry Analysis</button>';
            formSection.appendChild(retryBar);
            document.getElementById('retryBtn').addEventListener('click', () => {
                retryBar.remove();
                runAnalysis();
            });
        }
    }

    function animateLoadingSteps() {
        const steps = ['ls1', 'ls2', 'ls3', 'ls4'];
        let i = 0;
        const interval = setInterval(() => {
            if (i > 0) {
                const prev = document.getElementById(steps[i - 1]);
                prev.classList.remove('active');
                prev.classList.add('done');
                prev.querySelector('.loading-step-icon').textContent = '\u2713';
            }
            if (i < steps.length) {
                const curr = document.getElementById(steps[i]);
                curr.classList.add('active');
                curr.querySelector('.loading-step-icon').textContent = '\u25CF';
            }
            i++;
            if (i > steps.length) clearInterval(interval);
        }, 3000);
        window._loadingInterval = interval;
    }

    // === DISPLAY RESULTS ===
    async function displayResults(data) {
        if (window._loadingInterval) clearInterval(window._loadingInterval);

        resultsSection.style.display = 'block';
        resultsSection.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const score = data.score || 0;
        animateScore(score);
        document.getElementById('scoreVerdict').textContent = data.scoreVerdict || '';

        const ring = document.getElementById('scoreRing');
        if (score >= 70) ring.style.stroke = 'var(--green)';
        else if (score >= 40) ring.style.stroke = 'var(--yellow)';
        else ring.style.stroke = 'var(--red)';

        // Sub-scores
        if (data.scores) {
            const subs = [
                { key: 'conversion', numId: 'conversionScore', fillId: 'conversionFill' },
                { key: 'copy', numId: 'copyScore', fillId: 'copyFill' },
                { key: 'design', numId: 'designScore', fillId: 'designFill' },
                { key: 'cta', numId: 'ctaScore', fillId: 'ctaFill' },
                { key: 'seo', numId: 'seoScore', fillId: 'seoFill' },
            ];
            subs.forEach(s => {
                const val = data.scores[s.key] || 0;
                const numEl = document.getElementById(s.numId);
                const fillEl = document.getElementById(s.fillId);
                if (numEl) {
                    let current = 0;
                    const step = () => {
                        current += 1;
                        if (current > val) current = val;
                        numEl.textContent = current;
                        if (current < val) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                }
                if (fillEl) {
                    setTimeout(() => {
                        fillEl.style.width = val + '%';
                        if (val >= 70) fillEl.style.background = 'var(--green)';
                        else if (val >= 40) fillEl.style.background = 'var(--yellow)';
                        else fillEl.style.background = 'var(--red)';
                    }, 100);
                }
            });
        }

        // Problems
        const problemsList = document.getElementById('problemsList');
        problemsList.innerHTML = '';
        if (data.problems?.length) {
            data.problems.forEach(p => {
                const sevClass = p.severity === 'high' ? 'severity-high' :
                                 p.severity === 'medium' ? 'severity-medium' : 'severity-low';
                problemsList.innerHTML += `
                    <div class="problem-item">
                        <span class="problem-severity ${sevClass}">${esc(p.severity)}</span>
                        <div class="problem-text">
                            <div class="problem-title">${esc(p.title)}</div>
                            <div class="problem-desc">${esc(p.description)}</div>
                        </div>
                    </div>`;
            });
        }

        // Build live website preview
        const frame = document.getElementById('previewFrame');
        const loading = document.getElementById('previewLoading');
        const changesList = document.getElementById('previewChangesList');
        const toggleImproved = document.getElementById('toggleImproved');
        const toggleOriginal = document.getElementById('toggleOriginal');
        const previewHero = document.getElementById('previewHero');

        loading.classList.remove('hidden');
        changesList.innerHTML = '';

        // Store HTML versions for toggling
        window._previewOriginalHtml = null;
        window._previewImprovedHtml = null;
        window._previewMode = 'improved';

        // Load preview: use iframe src for better rendering of complex/JS-heavy sites
        // The proxy handles base tag injection, CSP stripping, and disable-navigation
        const siteUrl = answers.url || '';
        const proxyUrl = '/api/proxy?url=' + encodeURIComponent(siteUrl);

        try {
            // Load the page via iframe src for native browser rendering
            frame.addEventListener('load', function onFirstLoad() {
                frame.removeEventListener('load', onFirstLoad);
                loading.classList.add('hidden');

                // Give JS frameworks a moment to render, then capture the DOM
                setTimeout(() => {
                    try {
                        const doc = frame.contentDocument || frame.contentWindow.document;
                        if (doc && doc.documentElement) {
                            const renderedHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
                            window._previewOriginalHtml = renderedHtml;

                            // Apply before/after text replacements for improved version
                            let improvedHtml = renderedHtml;
                            if (data.beforeAfter?.length) {
                                data.beforeAfter.forEach(item => {
                                    if (item.before && item.after) {
                                        const beforeText = item.before.trim();
                                        if (beforeText && improvedHtml.includes(beforeText)) {
                                            improvedHtml = improvedHtml.split(beforeText).join(item.after.trim());
                                        }
                                    }
                                });
                            }
                            window._previewImprovedHtml = improvedHtml;

                            // Default to improved view
                            if (improvedHtml !== renderedHtml) {
                                frame.srcdoc = improvedHtml;
                            }
                        }
                    } catch (e) {
                        console.warn('Could not access iframe content for toggle:', e);
                    }
                }, 1500);
            });

            frame.src = proxyUrl;

            // Also fetch HTML via fetch() as fallback for toggle (in case contentDocument is blocked)
            fetch(proxyUrl).then(res => res.ok ? res.text() : null).then(html => {
                if (html && !window._previewOriginalHtml) {
                    window._previewOriginalHtml = html;
                    let improvedHtml = html;
                    if (data.beforeAfter?.length) {
                        data.beforeAfter.forEach(item => {
                            if (item.before && item.after) {
                                const beforeText = item.before.trim();
                                if (beforeText && improvedHtml.includes(beforeText)) {
                                    improvedHtml = improvedHtml.split(beforeText).join(item.after.trim());
                                }
                            }
                        });
                    }
                    window._previewImprovedHtml = improvedHtml;
                }
            }).catch(() => {});

            // Build side panel with changes + why
            if (data.beforeAfter?.length) {
                data.beforeAfter.forEach(item => {
                    const why = item.why || '';
                    changesList.innerHTML += `
                        <div class="preview-change-item">
                            <div class="preview-change-section">${esc(item.section)}</div>
                            <div class="preview-change-before">${esc(item.before)}</div>
                            <div class="preview-change-after">${esc(stripHtml(item.after))}</div>
                            ${why ? '<div class="preview-change-why">' + esc(why) + '</div>' : ''}
                        </div>`;
                });
            }

            // Toggle function for both inline and fullscreen
            function setPreviewMode(mode) {
                window._previewMode = mode;
                const html = mode === 'improved' ? window._previewImprovedHtml : window._previewOriginalHtml;
                if (html) {
                    frame.srcdoc = html;
                } else if (mode === 'original') {
                    frame.removeAttribute('srcdoc');
                    frame.src = proxyUrl;
                }

                // Inline toggles
                toggleImproved.classList.toggle('active', mode === 'improved');
                toggleOriginal.classList.toggle('active', mode === 'original');

                // Fullscreen toggles
                const fsImproved = document.getElementById('fsToggleImproved');
                const fsOriginal = document.getElementById('fsToggleOriginal');
                const fsLabel = document.getElementById('fsLabel');
                const fsFrame = document.getElementById('fullscreenFrame');
                fsImproved.classList.toggle('active', mode === 'improved');
                fsOriginal.classList.toggle('active', mode === 'original');
                fsLabel.textContent = mode === 'improved' ? 'Viewing: New version' : 'Viewing: Old version';
                if (html) fsFrame.srcdoc = html;
            }

            toggleImproved.onclick = () => setPreviewMode('improved');
            toggleOriginal.onclick = () => setPreviewMode('original');

            // Fullscreen toggles
            document.getElementById('fsToggleImproved').onclick = () => setPreviewMode('improved');
            document.getElementById('fsToggleOriginal').onclick = () => setPreviewMode('original');

        } catch (previewErr) {
            console.warn('Preview failed:', previewErr);
            loading.classList.add('hidden');
            frame.srcdoc = '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0b;color:#888;font-family:system-ui;"><p>Could not load website preview</p></body></html>';
        }

        document.getElementById('whyText').textContent = data.whyItWorks || '';
    }

    function animateScore(target) {
        const numEl = document.getElementById('scoreNumber');
        const ringEl = document.getElementById('scoreRing');
        const circumference = 2 * Math.PI * 52;
        let current = 0;
        const step = () => {
            current += 1;
            if (current > target) current = target;
            numEl.textContent = current;
            ringEl.style.strokeDashoffset = circumference - (current / 100) * circumference;
            if (current < target) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function stripHtml(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.innerHTML = str;
        return d.textContent || d.innerText || '';
    }

    window.copyText = function (btn) {
        const text = btn.previousElementSibling?.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
    };

    // === TOAST NOTIFICATIONS ===
    function showSuccessToast(title, desc) {
        const toast = document.getElementById('successToast');
        const toastDesc = document.getElementById('toastDesc');
        if (title) toast.querySelector('.toast-title').textContent = title;
        if (desc) toastDesc.textContent = desc;
        toast.classList.add('active');
        const autoHide = setTimeout(() => toast.classList.remove('active'), 6000);
        document.getElementById('toastClose').onclick = () => {
            clearTimeout(autoHide);
            toast.classList.remove('active');
        };
    }

    function showErrorToast(title, desc) {
        const toast = document.getElementById('errorToast');
        if (title) document.getElementById('errorToastTitle').textContent = title;
        if (desc) document.getElementById('errorToastDesc').textContent = desc;
        toast.classList.add('active');
        const autoHide = setTimeout(() => toast.classList.remove('active'), 6000);
        document.getElementById('errorToastClose').onclick = () => {
            clearTimeout(autoHide);
            toast.classList.remove('active');
        };
    }

})();

