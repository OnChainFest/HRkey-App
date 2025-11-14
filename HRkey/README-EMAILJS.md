# EmailJS Quick Setup for HRKey

## ⚡ Setup Rápido (5 minutos)

### 1. Crear Cuenta
- Ve a https://www.emailjs.com/
- Sign up (gratis)

### 2. Conectar Email
- Dashboard → **Add New Service**
- Selecciona **Gmail** (o tu email)
- Autoriza y copia el **Service ID**

### 3. Crear Templates

Necesitas 3 templates en EmailJS Dashboard → **Email Templates**:

#### Template 1: Invitación
```
Subject: Reference Request - {{applicant_position}}

Hi {{to_name}},

Complete your reference here:
{{verification_link}}

Expires in {{expires_in_days}} days.
```

#### Template 2: Completada
```
Subject: Reference Completed!

Hi {{to_name}},

{{referrer_name}} completed your reference!
Rating: {{overall_rating}}/5 ⭐
```

#### Template 3: Digest (opcional)
```
Subject: KPI Digest - {{date}}

{{{html_content}}}
```

### 4. Variables de Entorno

En `.env.local`:
```bash
NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=tu-public-key
NEXT_PUBLIC_EMAILJS_SERVICE_ID=service_abc123
NEXT_PUBLIC_EMAILJS_TEMPLATE_INVITE=template_invite
NEXT_PUBLIC_EMAILJS_TEMPLATE_COMPLETED=template_completed
NEXT_PUBLIC_EMAILJS_TEMPLATE_DIGEST=template_digest
DIGEST_TO_EMAIL=tu-email@ejemplo.com
```

### 5. Listo!

Ya puedes enviar emails. La app automáticamente usará EmailJS.

---

## 📖 Guía Completa

Ver [`EMAILJS-SETUP.md`](../EMAILJS-SETUP.md) en la raíz del proyecto.

---

## 🎯 Uso en el Código

```typescript
import { sendReferenceInvite } from '@/lib/emailjs';

await sendReferenceInvite({
  to_email: 'referente@ejemplo.com',
  to_name: 'Juan Pérez',
  verification_link: 'https://...',
  applicant_position: 'Developer',
});
```

---

## 💡 Tips

- **Límite gratuito**: 200 emails/mes
- **Templates**: Usa el editor visual de EmailJS
- **Testing**: Prueba con tu propio email primero
- **Production**: Las mismas credenciales funcionan en Vercel

---

**¿Problemas?** Ver [EMAILJS-SETUP.md](../EMAILJS-SETUP.md) sección Troubleshooting.
