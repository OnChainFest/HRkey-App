# EmailJS Setup Guide for HRKey

## 🎯 ¿Por qué EmailJS?

EmailJS es perfecto para HRKey porque:
- ✅ **Sin backend propio**: No necesitas servidor de email
- ✅ **Gratis**: 200 emails/mes en plan gratuito
- ✅ **Templates visuales**: Crea templates en el dashboard
- ✅ **Cliente y servidor**: Funciona desde frontend y API routes
- ✅ **Fácil setup**: 5 minutos para configurar

---

## 📧 Paso 1: Crear Cuenta en EmailJS

1. Ve a https://www.emailjs.com/
2. Click en "Sign Up"
3. Crea tu cuenta (gratis)

---

## 🔌 Paso 2: Conectar Servicio de Email

### Opción A: Gmail (Recomendado para desarrollo)

1. En EmailJS Dashboard → **Email Services**
2. Click **Add New Service**
3. Selecciona **Gmail**
4. Autoriza tu cuenta de Gmail
5. Copia el **Service ID** (ej: `service_abc123`)

### Opción B: Otros Servicios

EmailJS soporta:
- Outlook
- Yahoo
- Custom SMTP
- SendGrid
- Mailgun

---

## 📝 Paso 3: Crear Templates de Email

EmailJS usa templates que defines en su dashboard. Necesitas crear 3 templates:

### Template 1: Invitación de Referencia

**En EmailJS Dashboard:**
1. Ve a **Email Templates**
2. Click **Create New Template**
3. **Template Name**: `Reference Invitation`
4. **Template ID**: Copia este ID (ej: `template_invite_123`)

**Contenido del Template:**

```html
Subject: Reference Request {{applicant_position}}

Hi {{to_name}},

You've been asked to provide a professional reference{{#applicant_company}} for a role at {{applicant_company}}{{/applicant_company}}.

Please click the link below to complete the reference:

{{verification_link}}

This link will expire in {{expires_in_days}} days.

Best regards,
The HRKey Team
```

**Variables que usa** (se pasan desde el código):
- `{{to_name}}` - Nombre del referente
- `{{to_email}}` - Email del referente
- `{{verification_link}}` - Link único de verificación
- `{{applicant_position}}` - Posición aplicada
- `{{applicant_company}}` - Empresa
- `{{expires_in_days}}` - Días hasta expiración

---

### Template 2: Referencia Completada

**Crear otro template:**

```html
Subject: Your reference has been completed!

Hi {{to_name}},

Great news! {{referrer_name}} has completed your professional reference.

Overall Rating: {{overall_rating}}/5 ⭐

View your reference here:
{{dashboard_link}}

Best regards,
The HRKey Team
```

**Variables:**
- `{{to_name}}` - Nombre del usuario
- `{{referrer_name}}` - Quien completó
- `{{overall_rating}}` - Rating 1-5
- `{{dashboard_link}}` - Link al dashboard

---

### Template 3: KPI Digest (Opcional)

Para el cron job diario:

```html
Subject: HRKey KPI Digest — {{date}} — {{count}} item(s)

{{{html_content}}}
```

**Variables:**
- `{{date}}` - Fecha
- `{{count}}` - Cantidad de KPIs
- `{{{html_content}}}` - HTML del digest (triple brackets = sin escape)

---

## 🔑 Paso 4: Obtener Credenciales

En EmailJS Dashboard:

1. **Service ID**:
   - Email Services → Tu servicio → Copia el ID
   - Ej: `service_abc123`

2. **Template IDs**:
   - Email Templates → Cada template → Copia el ID
   - Invitación: `template_invite_xxx`
   - Completada: `template_completed_xxx`
   - Digest: `template_digest_xxx`

3. **Public Key**:
   - Account → API Keys (o General)
   - Copia tu Public Key
   - Ej: `abc123XYZ`

---

## ⚙️ Paso 5: Configurar Variables de Entorno

### En `.env.local` (desarrollo):

```bash
# EmailJS Configuration
NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=tu-public-key-aqui
NEXT_PUBLIC_EMAILJS_SERVICE_ID=service_abc123
NEXT_PUBLIC_EMAILJS_TEMPLATE_INVITE=template_invite_xxx
NEXT_PUBLIC_EMAILJS_TEMPLATE_COMPLETED=template_completed_xxx
NEXT_PUBLIC_EMAILJS_TEMPLATE_DIGEST=template_digest_xxx

# Optional: Email para digest diario
DIGEST_TO_EMAIL=tu-email@ejemplo.com
```

### En Vercel (producción):

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega cada variable:
   - `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY`
   - `NEXT_PUBLIC_EMAILJS_SERVICE_ID`
   - `NEXT_PUBLIC_EMAILJS_TEMPLATE_INVITE`
   - `NEXT_PUBLIC_EMAILJS_TEMPLATE_COMPLETED`
   - `NEXT_PUBLIC_EMAILJS_TEMPLATE_DIGEST`
   - `DIGEST_TO_EMAIL`

4. Redeploy el proyecto

---

## 🧪 Paso 6: Probar

### Prueba desde el Dashboard:

```javascript
// En /dashboard cuando envías invitación
import { sendReferenceInvite } from '@/lib/emailjs';

// Al hacer click en "Enviar invitación"
const result = await sendReferenceInvite({
  to_email: 'referente@ejemplo.com',
  to_name: 'Juan Pérez',
  verification_link: 'https://tu-app.com/ref/verify?token=abc123',
  applicant_position: 'Software Engineer',
  applicant_company: 'Tech Corp',
});

if (result.success) {
  console.log('✅ Email enviado!');
} else {
  console.error('❌ Error:', result.error);
}
```

### Inicializar en Layout:

```typescript
// En app/layout.tsx
import { initEmailJS } from '@/lib/emailjs';
import { useEffect } from 'react';

export default function RootLayout({ children }) {
  useEffect(() => {
    initEmailJS();
  }, []);

  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

---

## 🎨 Personalizar Templates

### En EmailJS Dashboard:

1. Email Templates → Tu template
2. Usa el editor visual o HTML
3. Variables disponibles: `{{nombre_variable}}`
4. HTML condicional:
   ```html
   {{#variable}}
     Esto se muestra si variable existe
   {{/variable}}
   ```

### Ejemplo Mejorado (Invitación):

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #00C4C7; padding: 20px; text-align: center; }
    .content { background: #fff; padding: 30px; }
    .button {
      display: inline-block;
      background: #00C4C7;
      color: #000;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
    }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="color: #000; margin: 0;">HRKey</h1>
    </div>

    <div class="content">
      <h2>You've been asked to provide a professional reference</h2>

      <p>Hi {{to_name}},</p>

      <p>
        Someone has requested a reference from you{{#applicant_position}}
        for their role as <strong>{{applicant_position}}</strong>{{/applicant_position}}{{#applicant_company}}
        at <strong>{{applicant_company}}</strong>{{/applicant_company}}.
      </p>

      <p style="text-align: center; margin: 30px 0;">
        <a href="{{verification_link}}" class="button">
          Complete Reference
        </a>
      </p>

      <p>This link will expire in {{expires_in_days}} days.</p>

      <p style="font-size: 12px; color: #666;">
        If the button doesn't work, copy and paste this link:<br>
        {{verification_link}}
      </p>
    </div>

    <div class="footer">
      <p>Best regards,<br>The HRKey Team</p>
    </div>
  </div>
</body>
</html>
```

---

## 📊 Límites y Precios

### Plan Gratuito:
- ✅ 200 emails/mes
- ✅ Templates ilimitados
- ✅ 1 servicio de email
- ✅ Soporte básico

### Si necesitas más:
- **Personal**: $7/mes - 1,000 emails
- **Pro**: $15/mes - 5,000 emails
- **Business**: $35/mes - 15,000 emails

Para HRKey, **el plan gratuito es suficiente** para empezar.

---

## 🐛 Troubleshooting

### Error: "EmailJS public key not found"
**Solución**: Verifica que `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY` esté en `.env.local` o Vercel

### Error: "Service ID or Template ID missing"
**Solución**: Verifica que todas las variables estén configuradas

### Emails no se envían
**Posibles causas**:
1. Límite mensual alcanzado (200 en plan gratuito)
2. Service ID incorrecto
3. Gmail bloqueó el servicio (verifica en EmailJS dashboard)

**Solución**:
1. Revisa EmailJS Dashboard → History → Ver errores
2. Verifica credenciales
3. Prueba con otro servicio de email

### Template variables no se reemplazan
**Solución**: Asegúrate de usar `{{variable}}` (doble llave) en el template

### HTML se escapa (muestra tags)
**Solución**: Para HTML usa triple llave: `{{{html_content}}}`

---

## ✅ Checklist de Setup

- [ ] Cuenta creada en EmailJS
- [ ] Servicio de email conectado (Gmail/Outlook)
- [ ] 3 templates creados:
  - [ ] Invitación de referencia
  - [ ] Referencia completada
  - [ ] KPI Digest (opcional)
- [ ] Credenciales copiadas:
  - [ ] Public Key
  - [ ] Service ID
  - [ ] Template IDs (3)
- [ ] Variables configuradas en `.env.local`
- [ ] Variables configuradas en Vercel
- [ ] Código actualizado con `import { initEmailJS }...`
- [ ] Probado envío de email

---

## 📞 Soporte

- **EmailJS Docs**: https://www.emailjs.com/docs/
- **Dashboard**: https://dashboard.emailjs.com/
- **Limits**: https://www.emailjs.com/pricing/

---

## 🚀 Ejemplo Completo de Uso

```typescript
// En tu componente de dashboard
import { sendReferenceInvite } from '@/lib/emailjs';
import { makeRefereeLink } from '@/utils/appURL';

async function handleSendInvite(refereeEmail: string, refereeName: string) {
  // 1. Crear invitación en Supabase (obtener token)
  const { data: invite } = await supabase
    .from('reference_invites')
    .insert([{
      referee_email: refereeEmail,
      referee_name: refereeName,
      invite_token: crypto.randomBytes(32).toString('hex'),
      status: 'pending',
    }])
    .select()
    .single();

  // 2. Generar link
  const verifyUrl = makeRefereeLink(invite.invite_token);

  // 3. Enviar email con EmailJS
  const result = await sendReferenceInvite({
    to_email: refereeEmail,
    to_name: refereeName,
    verification_link: verifyUrl,
    applicant_position: 'Software Engineer',
    applicant_company: 'HRKey',
  });

  if (result.success) {
    alert('✅ Invitación enviada!');
  } else {
    alert('❌ Error al enviar email');
    console.error(result.error);
  }
}
```

---

¡Listo! Ahora HRKey está configurado con EmailJS. 🎉
