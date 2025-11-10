// JavaScript Document
/* global WOW, jQuery */
(function ($) {
  "use strict";

  /*----------------------------------------------------*/
  /*  Preloader
  /*----------------------------------------------------*/
  $(window).on("load", function () {
    const preloader = $("#loading");
    const loader = preloader.find("#loading-center-absolute");
    loader.fadeOut();
    preloader.delay(400).fadeOut("slow");
  });

  /*----------------------------------------------------*/
  /*  Navigation Menu Scroll
  /*----------------------------------------------------*/
  $(window).on("scroll", function () {
    const top = $(window).scrollTop();
    if (top > 80) {
      $(".wsmainfull").addClass("scroll");
    } else {
      $(".wsmainfull").removeClass("scroll");
    }
  });

  /*----------------------------------------------------*/
  /*  DOM Ready
  /*----------------------------------------------------*/
  $(document).ready(function () {
    new WOW().init();

    /*----------------------------------------------------*/
    /*  Mobile Menu Toggle
    /*----------------------------------------------------*/
    if ($(window).outerWidth() < 992) {
      $(".wsmenu-list li.nl-simple, .wsmegamenu li, .sub-menu li").on("click", function () {
        $("body").removeClass("wsactive");
        $(".sub-menu").slideUp("slow");
        $(".wsmegamenu").slideUp("slow");
        $(".wsmenu-click").removeClass("ws-activearrow");
        $(".wsmenu-click02 > i").removeClass("wsmenu-rotate");
      });

      $(".wsanimated-arrow").on("click", function () {
        $(".sub-menu").slideUp("slow");
        $(".wsmegamenu").slideUp("slow");
        $(".wsmenu-click").removeClass("ws-activearrow");
        $(".wsmenu-click02 > i").removeClass("wsmenu-rotate");
      });
    }

    /*----------------------------------------------------*/
    /*  ScrollUp (mini plugin local)
    /*----------------------------------------------------*/
    $.scrollUp = function (options) {
      const defaults = {
        scrollName: "scrollUp", // Element ID
        topDistance: 600, // px
        topSpeed: 800, // ms
        animation: "fade", // fade, slide, none
        animationInSpeed: 200,
        animationOutSpeed: 200,
        scrollText: "",
        scrollImg: false,
        activeOverlay: false,
      };

      const o = $.extend({}, defaults, options);
      const scrollId = "#" + o.scrollName;

      // Element
      $("<a/>", { id: o.scrollName, href: "#top", title: o.scrollText }).appendTo("body");

      if (!o.scrollImg) {
        $(scrollId).text(o.scrollText);
      }

      $(scrollId).css({ display: "none", position: "fixed", "z-index": "99999" });

      if (o.activeOverlay) {
        $("body").append("<div id='" + o.scrollName + "-active'></div>");
        $(scrollId + "-active").css({
          position: "absolute",
          top: o.topDistance + "px",
          width: "100%",
          "border-top": "1px dotted " + o.activeOverlay,
          "z-index": "99999",
        });
      }

      // Scroll behavior
      $(window).on("scroll", function () {
        switch (o.animation) {
          case "fade":
            $(($(window).scrollTop() > o.topDistance)
              ? $(scrollId).fadeIn(o.animationInSpeed)
              : $(scrollId).fadeOut(o.animationOutSpeed));
            break;
          case "slide":
            $(($(window).scrollTop() > o.topDistance)
              ? $(scrollId).slideDown(o.animationInSpeed)
              : $(scrollId).slideUp(o.animationOutSpeed));
            break;
          default:
            $(($(window).scrollTop() > o.topDistance) ? $(scrollId).show(0) : $(scrollId).hide(0));
        }
      });
    };
    $.scrollUp();

    /*----------------------------------------------------*/
    /*  Tabs
    /*----------------------------------------------------*/
    $("ul.tabs-1 li").on("click", function () {
      const tabId = $(this).attr("data-tab");
      $("ul.tabs-1 li").removeClass("current");
      $(".tab-content").removeClass("current");
      $(this).addClass("current");
      $("#" + tabId).addClass("current");
    });

    /*----------------------------------------------------*/
    /*  Masonry Grid
    /*----------------------------------------------------*/
    let $grid; // declarar antes para evitar problemas al pasar de var->let

    $(".grid-loaded").imagesLoaded(function () {
      // filtros
      $(".masonry-filter").on("click", "button", function () {
        const filterValue = $(this).attr("data-filter");
        if ($grid) $grid.isotope({ filter: filterValue });
      });

      $(".masonry-filter button").on("click", function () {
        $(".masonry-filter button").removeClass("is-checked");
        $(this).addClass("is-checked");
        const selector = $(this).attr("data-filter");
        if ($grid) $grid.isotope({ filter: selector });
        return false;
      });

      // init
      $grid = $(".masonry-wrap").isotope({
        itemSelector: ".masonry-image",
        percentPosition: true,
        transitionDuration: "0.7s",
        masonry: {
          columnWidth: ".masonry-image",
        },
      });
    });

    /*----------------------------------------------------*/
    /*  Accordion
    /*----------------------------------------------------*/
    $(".accordion > .accordion-item.is-active").children(".accordion-panel").slideDown();
    $(".accordion > .accordion-item").on("click", function () {
      $(this).siblings(".accordion-item").removeClass("is-active").children(".accordion-panel").slideUp();
      $(this).toggleClass("is-active").children(".accordion-panel").slideToggle("ease-out");
    });

    /*----------------------------------------------------*/
    /*  Lightboxes
    /*----------------------------------------------------*/
    $(".image-link").magnificPopup({ type: "image" });

    $(".video-popup1").magnificPopup({
      type: "iframe",
      iframe: { patterns: { youtube: { index: "youtube.com", src: "https://www.youtube.com/embed/SZEflIVnhH8" } } },
    });

    $(".video-popup2").magnificPopup({
      type: "iframe",
      iframe: { patterns: { youtube: { index: "youtube.com", src: "https://www.youtube.com/embed/7e90gBu4pas" } } },
    });

    $(".video-popup3").magnificPopup({
      type: "iframe",
      iframe: { patterns: { youtube: { index: "youtube.com", src: "https://www.youtube.com/embed/0gv7OC9L2s8" } } },
    });

    /*----------------------------------------------------*/
    /*  Statistic Counter
    /*----------------------------------------------------*/
    $(".count-element").each(function () {
      $(this).appear(
        function () {
          $(this)
            .prop("Counter", 0)
            .animate(
              { Counter: $(this).text() },
              {
                duration: 4000,
                easing: "swing",
                step: function (now) {
                  $(this).text(Math.ceil(now));
                },
              }
            );
        },
        { accX: 0, accY: 0 }
      );
    });

    /*----------------------------------------------------*/
    /*  Carousels (no redeclarar misma variable)
    /*----------------------------------------------------*/
    $(".reviews-1-wrapper").owlCarousel({
      items: 3,
      loop: true,
      autoplay: true,
      navBy: 1,
      autoplayTimeout: 4500,
      autoplayHoverPause: true,
      smartSpeed: 1500,
      responsive: { 0: { items: 1 }, 767: { items: 1 }, 768: { items: 2 }, 991: { items: 3 }, 1000: { items: 3 } },
    });

    $(".reviews-4-wrapper").owlCarousel({
      items: 2,
      loop: true,
      autoplay: true,
      navBy: 1,
      autoplayTimeout: 4500,
      autoplayHoverPause: true,
      smartSpeed: 1500,
      responsive: { 0: { items: 1 }, 767: { items: 1 }, 768: { items: 2 }, 991: { items: 2 }, 1000: { items: 2 } },
    });

    $(".brands-carousel").owlCarousel({
      items: 5,
      loop: true,
      autoplay: true,
      navBy: 1,
      nav: false,
      autoplayTimeout: 4000,
      autoplayHoverPause: false,
      smartSpeed: 2000,
      responsive: { 0: { items: 2 }, 550: { items: 3 }, 767: { items: 3 }, 768: { items: 4 }, 991: { items: 5 }, 1000: { items: 5 } },
    });

    /*----------------------------------------------------*/
    /*  jQuery Validate - Request Form
    /*----------------------------------------------------*/
    $(".request-form").validate({
      rules: {
        name: { required: true, minlength: 2, maxlength: 16 },
        email: { required: true, email: true },
      },
      messages: {
        name: { required: "Please enter no less than (2) characters" },
        email: {
          required: "We need your email address to contact you",
          email: "Your email address must be in the format of name@domain.com",
        },
      },
    });

    /*----------------------------------------------------*/
    /*  jQuery Validate - Contact Form
    /*----------------------------------------------------*/
    $(".contact-form").validate({
      rules: {
        name: { required: true, minlength: 1, maxlength: 16 },
        email: { required: true, email: true },
        message: { required: true, minlength: 2 },
      },
      messages: {
        name: { required: "Please enter no less than (1) characters" },
        email: {
          required: "We need your email address to contact you",
          email: "Your email address must be in the format of name@domain.com",
        },
        message: { required: "Please enter no less than (2) characters" },
      },
    });

    /*----------------------------------------------------*/
    /*  jQuery Validate - Comment Form
    /*----------------------------------------------------*/
    $(".comment-form").validate({
      rules: {
        name: { required: true, minlength: 1, maxlength: 16 },
        email: { required: true, email: true },
        message: { required: true, minlength: 2 },
      },
      messages: {
        name: { required: "Please enter no less than (1) characters" },
        email: {
          required: "We need your email address to contact you",
          email: "Your email address must be in the format of name@domain.com",
        },
        message: { required: "Please enter no less than (2) characters" },
      },
    });

    /*----------------------------------------------------*/
    /*  jQuery Validate - Sign In Form
    /*----------------------------------------------------*/
    $(".sign-in-form").validate({
      rules: {
        password: { required: true, minlength: 2, maxlength: 16 },
        email: { required: true, email: true },
      },
      messages: {
        password: { required: "Please enter no less than (2) characters" },
        email: {
          required: "Please enter valid email address",
          email: "Your email address must be in the format of name@domain.com",
        },
      },
    });

    /*----------------------------------------------------*/
    /*  jQuery Validate - Sign Up Form
    /*----------------------------------------------------*/
    $(".sign-up-form").validate({
      rules: {
        name: { required: true, minlength: 2, maxlength: 16 },
        password: { required: true, minlength: 2, maxlength: 16 },
        email: { required: true, email: true },
      },
      messages: {
        name: { required: "Please enter no less than (2) characters" },
        password: { required: "Please enter no less than (2) characters" },
        email: {
          required: "Please enter valid email address",
          email: "Your email address must be in the format of name@domain.com",
        },
      },
    });

    /*----------------------------------------------------*/
    /*  jQuery Validate - Reset Password Form
    /*----------------------------------------------------*/
    $(".reset-password-form").validate({
      rules: { email: { required: true, email: true } },
      messages: {
        email: {
          required: "We need your email address to contact you",
          email: "Your email address must be in the format of name@domain.com",
        },
      },
    });

    /*----------------------------------------------------*/
    /*  Show Password
    /*----------------------------------------------------*/
    let showPass = false;
    $(".btn-show-pass").on("click", function () {
      const $input = $(this).next("input");
      const $icon = $(this).find("span.eye-pass");

      if (!showPass) {
        $input.attr("type", "text");
        $icon.removeClass("flaticon-visible").addClass("flaticon-hidden");
      } else {
        $input.attr("type", "password");
        $icon.addClass("flaticon-visible").removeClass("flaticon-hidden");
      }
      showPass = !showPass;
    });

    /*----------------------------------------------------*/
    /*  Newsletter Subscribe (ajaxChimp)
    /*----------------------------------------------------*/
    $(".newsletter-form").ajaxChimp({
      language: "cm",
      url: "https://dsathemes.us3.list-manage.com/subscribe/post?u=af1a6c0b23340d7b339c085b4&id=344a494a6e",
    });

    $.ajaxChimp.translations.cm = {
      submit: "Submitting...",
      0: "We have sent you a confirmation email",
      1: "Please enter your email address",
      2: "An email address must contain a single @",
      3: "The domain portion of the email address is invalid (the portion after the @: )",
      4: "The username portion of the email address is invalid (the portion before the @: )",
      5: "This email address looks fake or invalid. Please enter a real email address",
    };
  });
})(jQuery);

