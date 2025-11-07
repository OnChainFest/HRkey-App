            async submitRequest() {
                try {
                    this.saveStepData();
                    const submitBtn = document.getElementById('submitBtn');
                    submitBtn.textContent = 'Sending Request...'; 
                    submitBtn.disabled = true;

                    // Preparar datos para la API
                    const requestData = { 
                        id: Date.now(), 
                        ...this.formData, 
                        status: 'pending', 
                        createdAt: new Date().toISOString(), 
                        requesterAddress: this.getCurrentUserAddress() 
                    };

                    console.log('Submitting reference request:', requestData);

                    // Llamar a la API real en lugar de localStorage
                    const apiResponse = await window.APIClient.sendReferenceInvite(requestData);
                    
                    if (apiResponse.success) {
                        console.log('API Response:', apiResponse.data);
                        
                        // Guardar localmente para el dashboard (opcional)
                        await this.saveToLocalStorage(requestData);
                        
                        // Mostrar mensaje de éxito con datos reales de la API
                        this.showSuccessMessage(apiResponse.data);
                    } else {
                        throw new Error(apiResponse.error || 'Failed to send invitation');
                    }

                } catch (error) {
                    console.error('Error submitting request:', error);
                    alert('There was an error sending your request: ' + error.message);
                    const submitBtn = document.getElementById('submitBtn');
                    submitBtn.textContent = 'Send Reference Request'; 
                    submitBtn.disabled = false;
                }
            }
