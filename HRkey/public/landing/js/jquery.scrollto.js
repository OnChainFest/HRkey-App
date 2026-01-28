/*!
 * jquery.scrollto.js 0.0.1 - https://github.com/yckart/jquery.scrollto.js
 * Scroll smooth to any element in your DOM.
 *
 * Copyright (c) 2012 Yannick Albert (http://yckart.com)
 * Licensed under the MIT license (http://www.opensource.org/licenses/mit-license.php).
 * 2013/02/17
 **/
$.scrollTo = $.fn.scrollTo = function (x, y, options) {
  if (!(this instanceof $)) return $.fn.scrollTo.apply($('html, body'), arguments);

  const opts = $.extend(
    {},
    {
      gap: { x: 0, y: 0 },
      animation: {
        easing: 'easeInSine',
        duration: 'slow',
        complete: $.noop,
        step: $.noop,
      },
    },
    options
  );

  return this.each(function () {
    const $elem = $(this);

    const isNumX = typeof x === 'number' && !Number.isNaN(x);
    const isNumY = typeof y === 'number' && !Number.isNaN(y);

    // Si alguno no es numérico, usamos el offset del objetivo y
    const $target = (!isNumX || !isNumY) ? $(y) : null;
    const off = $target ? $target.offset() : null;

    const left = isNumX ? x : (off ? off.left + opts.gap.x : 0);
    const top  = isNumY ? y : (off ? off.top + opts.gap.y - 69 : 0); // *edited

    $elem.stop().animate(
      { scrollLeft: left, scrollTop: top },
      opts.animation
    );
  });
};
