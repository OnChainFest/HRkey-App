class HRKeyAPIClient {
    constructor() {
        this.baseURL = 'http://localhost:3000';
    }

    async sendReferenceInvite(formData) {
        try {
            console.log('Sending to API:', formData);
            
            const response = await fetch(`${this.baseURL}/api/invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: formData.referee.email,
                    name: `${formData.referee.firstName} ${formData.referee.lastName}`,
                    days: 7
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const result = await response.json();
            return { success: true, data: result };
        } catch (error) {
            console.error('API failed:', error);
            return { success: false, error: error.message };
        }
    }
}

window.APIClient = new HRKeyAPIClient();
