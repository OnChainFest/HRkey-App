// JavaScript Document
$(document).ready(function () {
  "use strict";

  // Helpers UI
  const $loading = $(".loading");
  const showLoading = (msg) =>
    $loading.stop(true, true).fadeIn("slow").text(msg || "Loading...");
  const showSuccess = (msg) =>
    $loading.stop(true, true).fadeIn("slow").text(msg || "Mail sent successfully.").delay(3000).fadeOut("slow");
  const showError = (msg) =>
    $loading.stop(true, true).fadeIn("slow").text(msg || "Mail not sent.").delay(3000).fadeOut("slow");

  const markState = ($el, state /* 'error' | 'success' | 'clear' */) => {
    const $ctrl = $el.closest(".form-control");
    if (state === "error") {
      $ctrl.removeClass("success").addClass("error");
      $el.trigger("focus");
    } else if (state === "success") {
      $ctrl.removeClass("error").addClass("success");
    } else {
      $ctrl.removeClass("error success");
    }
  };

  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

  $(".quick-form").on("submit", function (e) {
    e.preventDefault();

    const $form = $(this);
    const $email = $form.find(".email");
    const email = String($email.val() || "").trim();

    let isValid = true;

    if (!email || !isEmail(email)) {
      markState($email, "error");
      isValid = false;
    } else {
      markState($email, "success");
    }

    if (!isValid) {
      // preventDefault ya aplicado; salimos sin devolver false
      return;
    }

    const dataString = "email=" + encodeURIComponent(email);

    showLoading("Loading...");

    $.ajax({
      type: "POST",
      url: "php/quickForm.php",
      data: dataString,
      cache: false
    })
      .done(function (resp) {
        const d = String(resp || "").toLowerCase().trim();
        if (d === "success" || d === "ok" || d === "true") {
          $(".form-control").removeClass("success"); // o mantener success si prefieres
          showSuccess("Mail sent successfully.");
          // Limpieza opcional:
          // $form[0].reset();
          // $(".form-control").removeClass("success error");
        } else {
          showError("Mail not sent.");
        }
      })
      .fail(function () {
        showError("Mail not sent.");
      });
  });

  $("#reset").on("click", function () {
    $(".form-control").removeClass("success error");
    $loading.stop(true, true).hide().text("");
  });
});
