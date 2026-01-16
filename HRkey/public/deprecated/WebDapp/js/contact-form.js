// JavaScript Document
$(document).ready(function () {
  "use strict";

  // Helpers UI para mensajes
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
    const v = String(value || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  $(".contact-form").on("submit", function (e) {
    e.preventDefault();

    const $form = $(this);
    const $name = $form.find(".name");
    const $email = $form.find(".email");
    const $subject = $form.find(".subject");
    const $msg = $form.find(".message");

    const name = String($name.val() || "").trim();
    const email = String($email.val() || "").trim();
    const subject = String($subject.val() || "").trim(); // opcional
    const msg = String($msg.val() || "").trim();

    let isValid = true;

    if (!name) { markState($name, "error"); isValid = false; }
    else { markState($name, "success"); }

    if (!email || !isEmail(email)) { markState($email, "error"); isValid = false; }
    else { markState($email, "success"); }

    // Si quieres que el subject sea OBLIGATORIO, descomenta:
    // if (!subject) { markState($subject, "error"); isValid = false; }
    // else { markState($subject, "success"); }
    // Como opcional, marcamos success solo si hay contenido:
    if (subject) { markState($subject, "success"); } else { markState($subject, "clear"); }

    if (!msg) { markState($msg, "error"); isValid = false; }
    else { markState($msg, "success"); }

    if (!isValid) {
      // Ya hicimos preventDefault; no devolvemos false.
      return;
    }

    const dataString =
      "name=" + encodeURIComponent(name) +
      "&email=" + encodeURIComponent(email) +
      "&subject=" + encodeURIComponent(subject) +
      "&msg=" + encodeURIComponent(msg);

    showLoading("Loading...");

    $.ajax({
      type: "POST",
      url: "php/contactForm.php",
      data: dataString,
      cache: false
    })
      .done(function (resp) {
        const d = String(resp || "").toLowerCase().trim();
        if (d === "success" || d === "ok" || d === "true") {
          $(".form-control").removeClass("success"); // o déjalo si quieres mantenerlo
          showSuccess("Mail sent successfully.");
          // Limpieza opcional del formulario:
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

