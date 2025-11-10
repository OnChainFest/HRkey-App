// JavaScript Document
$(document).ready(function () {
  "use strict";

  // Helpers UI
  const $loading = $(".loading");
  const showLoading = (msg) =>
    $loading.stop(true, true).fadeIn("slow").text(msg || "Please wait a minute...");
  const showSuccess = (msg) =>
    $loading.stop(true, true).fadeIn("slow").text(msg || "Check your email inbox.").delay(3000).fadeOut("slow");
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

  $(".reset-password-form").on("submit", function (e) {
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
      // preventDefault ya aplicado; no devolvemos false
      return;
    }

    const dataString = "email=" + encodeURIComponent(email);

    showLoading("Please wait a minute...");

    $.ajax({
      type: "POST",
      url: "php/resetForm.php",
      data: dataString,
      cache: false
    })
      .done(function (resp) {
        const d = String(resp || "").toLowerCase().trim();
        $(".form-control").removeClass("success");
        if (d === "success" || d === "ok" || d === "true") {
          showSuccess("Check your email inbox.");
          // Opcional: reset form
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
