/* ANS theme switch: monochrome (default) / gold. The choice is remembered in this browser. */
(function(){
  var KEY = 'ansTheme';
  var GOLD_LOGO = 'logo-gold.webp';   // logo shown in the gold theme (monochrome keeps the logo embedded in index.html)
  function saved(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function apply(theme){ document.documentElement.setAttribute('data-theme', theme); }

  // Runs in <head>, so the theme is set before the page paints (no flash)
  apply(saved() === 'gold' ? 'gold' : 'mono');

  // Logo per theme. The gold logo is preloaded; if it fails to load, the original logo stays.
  var logoImg = null, monoSrc = '', goldOk = null;
  function showLogo(theme){
    if(!logoImg) return;
    var root = document.documentElement;
    if(theme !== 'gold'){ logoImg.src = monoSrc; return; }
    function done(ok){
      goldOk = ok;
      if(document.documentElement.getAttribute('data-theme') === 'gold' && ok) logoImg.src = GOLD_LOGO;
      root.classList.add('logo-ready');
    }
    if(goldOk !== null){ done(goldOk); return; }
    var test = new Image();
    test.onload = function(){ done(true); };
    test.onerror = function(){ done(false); };
    test.src = GOLD_LOGO;
  }

  document.addEventListener('DOMContentLoaded', function(){
    logoImg = document.querySelector('.logo img');
    if(logoImg) monoSrc = logoImg.getAttribute('src');
    showLogo(document.documentElement.getAttribute('data-theme'));

    var btns = Array.prototype.slice.call(document.querySelectorAll('[data-theme-set]'));
    function sync(){
      var cur = document.documentElement.getAttribute('data-theme');
      btns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === cur)); });
    }
    btns.forEach(function(b){
      b.addEventListener('click', function(){
        var t = b.getAttribute('data-theme-set');
        apply(t);
        try{ localStorage.setItem(KEY, t); }catch(e){}
        showLogo(t);
        sync();
      });
    });
    sync();
  });
})();
