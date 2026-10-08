/* ANS theme switch: monochrome (default) / gold. The choice is remembered in this browser. */
(function(){
  var KEY = 'ansTheme';
  function saved(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function apply(theme){ document.documentElement.setAttribute('data-theme', theme); }

  // Runs in <head>, so the theme is set before the page paints (no flash)
  apply(saved() === 'gold' ? 'gold' : 'mono');

  document.addEventListener('DOMContentLoaded', function(){
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
        sync();
      });
    });
    sync();
  });
})();
