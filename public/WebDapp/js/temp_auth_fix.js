async performSocialLogin(provider) {
    // Bypass directo al dashboard
    localStorage.setItem('hrkey_auth', JSON.stringify({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        authProvider: provider,
        email: 'user@test.com',
        name: 'Test User',
        createdAt: Date.now()
    }));
    
    // Redirigir inmediatamente
    window.location.href = 'app.html';
    return { success: true };
}
