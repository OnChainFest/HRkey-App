// Actualizar la clase ReferenceRequestForm para manejar el step 1.5
sed -i '/this.currentStep = 1/c\            this.currentStep = 1;' request-reference.html

# Modificar la función nextStep para incluir step 1.5
sed -i '/nextStep() {/,/}/c\
            nextStep() {\
                if (this.validateCurrentStep()) {\
                    this.saveStepData();\
                    this.currentStep++;\
                    \
                    // Saltar step 1.5 si no es proactivo\
                    if (this.currentStep === 1.5 && this.formData.referenceTiming !== "proactive") {\
                        this.currentStep = 2;\
                    }\
                    \
                    this.showStep(this.currentStep);\
                    this.updateStepIndicator();\
                    \
                    // Actualizar KPIs cuando llegamos al step 3\
                    if (this.currentStep === 3) {\
                        setTimeout(updateKPISection, 100);\
                    }\
                    \
                    if (this.currentStep === 5) {\
                        this.populateReview();\
                    }\
                }\
            }' request-reference.html

# Modificar la función prevStep
sed -i '/prevStep() {/,/}/c\
            prevStep() {\
                this.currentStep--;\
                \
                // Saltar step 1.5 si no es proactivo al ir hacia atrás\
                if (this.currentStep === 1.5 && this.formData.referenceTiming !== "proactive") {\
                    this.currentStep = 1;\
                }\
                \
                this.showStep(this.currentStep);\
                this.updateStepIndicator();\
            }' request-reference.html
