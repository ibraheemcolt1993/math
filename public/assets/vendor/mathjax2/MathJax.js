(function (global) {
  if (global.MathJax && global.MathJax.Hub && typeof global.MathJax.Hub.Queue === 'function') {
    return;
  }

  var mathJaxState = {
    config: {}
  };

  function hasKatex() {
    return global.katex && typeof global.katex.render === 'function';
  }

  function typeset(root) {
    var target = root || document.body;
    if (!target || !hasKatex()) {
      return;
    }

    var scripts = target.querySelectorAll('script[type^="math/tex"]');
    scripts.forEach(function (script) {
      var isDisplay = script.type.indexOf('mode=display') !== -1;
      var latex = script.textContent || '';
      var span = document.createElement('span');
      span.className = isDisplay ? 'mathjax-placeholder mathjax-display' : 'mathjax-placeholder mathjax-inline';
      script.parentNode.insertBefore(span, script);
      script.parentNode.removeChild(script);
      try {
        global.katex.render(latex || '\\; ', span, {
          throwOnError: false,
          displayMode: isDisplay
        });
      } catch (error) {
        span.textContent = latex;
      }
    });
  }

  var Hub = {
    Config: function (config) {
      mathJaxState.config = config || {};
    },
    Queue: function (args) {
      if (Array.isArray(args) && args[0] === 'Typeset') {
        typeset(args[2] || args[1]);
      }
    }
  };

  var Ajax = {
    config: {
      path: {}
    },
    loadComplete: function () {}
  };

  global.MathJax = {
    Hub: Hub,
    Ajax: Ajax,
    __stub: true
  };
})(window);
