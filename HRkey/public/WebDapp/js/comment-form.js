// JavaScript Document
$(document).ready(function () {
  "use strict";

  // Helpers
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

  const isEmail = (value) => {
    // Validador simple y suficiente para UI (no RFC estricto)
    const v = String(value || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  $(".comment-form").on("submit", function (e) {
    e.preventDefault();

    const $form = $(this);
    const $name = $form.find(".name");
    const $email = $form.find(".email");
    const $msg = $form.find(".message");

    const name = String($name.val() || "").trim();
    const email = String($email.val() || "").trim();
    const msg = String($msg.val() || "").trim();

    let isValid = true;

    if (!name) {
      markState($name, "error");
      isValid = false;
    } else {
      markState($name, "success");
    }

    if (!email || !isEmail(email)) {
      markState($email, "error");
      isValid = false;
    } else {
      markState($email, "success");
    }

    if (!msg) {
      markState($msg, "error");
      isValid = false;
    } else {
      markState($msg, "success");
    }

    if (!isValid) {
      // No devolvemos false: ya hicimos preventDefault y terminamos aquí
      return;
    }

    // Construye payload seguro si los inputs no tienen name=""
    const dataString =
      "name=" + encodeURIComponent(name) +
      "&email=" + encodeURIComponent(email) +
      "&msg=" + encodeURIComponent(msg);

    showLoading("Loading...");

    $.ajax({
      type: "POST",
      url: "php/commentForm.php",
      data: dataString,
      cache: false
    })
      .done(function (resp) {
        // Normaliza respuesta
        const d = String(resp || "").toLowerCase().trim();
        if (d === "success" || d === "ok" || d === "true") {
          $(".form-control").removeClass("success"); // opcional: mantener success
          showSuccess("Mail sent successfully.");
          // Si quieres limpiar campos en éxito:
          // $form[0].reset();
        } else {
          showError("Mail not sent.");
        }
      })
      .fail(function () {
        showError("Mail not sent.");
      })
      .always(function () {
        // Lugar para desactivar loaders extra si los hubiera
      });
  });

  $("#reset").on("click", function () {
    $(".form-control").removeClass("success error");
    $loading.stop(true, true).hide().text("");
  });
});
