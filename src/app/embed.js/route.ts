import { NextResponse, type NextRequest } from 'next/server';

import { publicOrigin } from '@/lib/origin';

export const runtime = 'nodejs';

/**
 * The embed snippet, served as a static asset.
 *
 * Deliberately dependency-free ES5 so it runs on any landing page without a
 * build step, and small enough that inlining it is also reasonable.
 */
const SCRIPT = String.raw`
(function () {
  'use strict';

  var ORIGIN = '__ORIGIN__';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var STORE_KEY = 'mc_attribution';

  /* --- Attribution ---------------------------------------------------- *
   * Captured on first page view and kept for the session, so a visitor who
   * lands on an ad, browses, then converts on another page is still credited
   * to the campaign that brought them.
   * -------------------------------------------------------------------- */
  function readStore() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; }
  }

  function attribution() {
    var stored = readStore();
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }

    var found = false;
    var current = {};
    if (params) {
      for (var i = 0; i < UTM_KEYS.length; i++) {
        var v = params.get(UTM_KEYS[i]);
        if (v) { current[UTM_KEYS[i]] = v; found = true; }
      }
    }

    // A fresh campaign hit overwrites whatever we were holding.
    if (found) {
      current._referrer = document.referrer || stored._referrer || '';
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify(current)); } catch (e) {}
      return current;
    }

    if (!stored._referrer && document.referrer) {
      stored._referrer = document.referrer;
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify(stored)); } catch (e) {}
    }
    return stored;
  }

  /* --- DOM helpers ----------------------------------------------------- */
  function hiddenInput(form, name, value) {
    var el = form.querySelector('input[name="' + name + '"]');
    if (!el) {
      el = document.createElement('input');
      el.type = 'hidden';
      el.name = name;
      form.appendChild(el);
    }
    el.value = value;
    return el;
  }

  function setState(form, state, message) {
    form.setAttribute('data-mc-state', state);
    var target = form.querySelector('[data-mc-message]');
    if (target) target.textContent = message || '';
  }

  /* --- Wire up one form ------------------------------------------------ */
  function setup(form) {
    if (form.__mcReady) return;
    form.__mcReady = true;

    var formId = form.getAttribute('data-mailcatcher');
    if (!formId) return;

    var config = null;

    fetch(ORIGIN + '/f/' + formId + '/config', { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        config = data;

        // The trap field: off-screen rather than display:none, which naive bots
        // check for. Screen readers are told to skip it.
        var pot = document.createElement('div');
        pot.setAttribute('aria-hidden', 'true');
        pot.style.cssText = 'position:absolute!important;left:-9999px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important;';
        var potInput = document.createElement('input');
        potInput.type = 'text';
        potInput.name = data.honeypot;
        potInput.tabIndex = -1;
        potInput.autocomplete = 'off';
        pot.appendChild(potInput);
        form.appendChild(pot);

        hiddenInput(form, '_ts', data.token);
      })
      .catch(function () { /* the form still works without config */ });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (form.getAttribute('data-mc-state') === 'submitting') return;

      var attr = attribution();
      for (var key in attr) {
        if (!Object.prototype.hasOwnProperty.call(attr, key)) continue;
        hiddenInput(form, key === '_referrer' ? '_referrer' : '_' + key, attr[key]);
      }
      hiddenInput(form, '_url', window.location.href);

      var payload = {};
      var data = new FormData(form);
      data.forEach(function (value, name) {
        if (typeof value === 'string') payload[name] = value;
      });

      setState(form, 'submitting', '');

      fetch(ORIGIN + '/f/' + formId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mailcatcher' },
        body: JSON.stringify(payload),
        credentials: 'omit'
      })
        .then(function (response) {
          return response.json().then(function (body) { return { ok: response.ok, body: body }; });
        })
        .then(function (result) {
          if (result.ok && result.body.ok) {
            setState(form, 'success', result.body.message || (config && config.successMessage) || 'Thanks!');
            form.reset();
            var redirect = form.getAttribute('data-mc-redirect') || (config && config.redirectUrl);
            if (redirect) window.location.href = redirect;
            form.dispatchEvent(new CustomEvent('mailcatcher:success', { detail: result.body, bubbles: true }));
          } else {
            setState(form, 'error', (result.body && result.body.message) || 'Something went wrong. Please try again.');
            form.dispatchEvent(new CustomEvent('mailcatcher:error', { detail: result.body, bubbles: true }));
          }
        })
        .catch(function () {
          setState(form, 'error', 'Could not reach the server. Please try again.');
          form.dispatchEvent(new CustomEvent('mailcatcher:error', { bubbles: true }));
        });
    });
  }

  function scan() {
    var forms = document.querySelectorAll('form[data-mailcatcher]');
    for (var i = 0; i < forms.length; i++) setup(forms[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Pick up forms added later by a page builder or single-page app.
  if (window.MutationObserver) {
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.MailCatcher = { scan: scan };
})();
`.trim();

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request.headers, request.url);
  const body = SCRIPT.replace('__ORIGIN__', origin);

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      // Short public cache: the origin is baked in, so it must not be pinned
      // forever, but landing pages should not refetch it on every view either.
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      'access-control-allow-origin': '*',
    },
  });
}
