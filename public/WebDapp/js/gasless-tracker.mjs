/**
 * Sistema de tracking de transacciones gasless
 * Reglas:
 * - REQUEST (solicitud): GRATIS (1 vez)
 * - REFERENCE (referencia dada): GRATIS (1 vez)
 * - CLARIFICATION (aclaración): GRATIS (1 vez)
 * - COMPLEMENT (complemento): GRATIS (1 vez)
 * - Cualquier adicional: SE COBRA
 */

export class GaslessTracker {
  constructor() {
    this.storageKey = 'hrkey_gasless_usage';
  }

  /**
   * Obtiene el uso actual de una referencia
   */
  getUsage(referenceId) {
    const allUsage = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
    return allUsage[referenceId] || {};
  }

  /**
   * Verifica si un tipo de transacción puede usar gasless
   */
  canUseGasless(referenceId, txType) {
    const usage = this.getUsage(referenceId);
    const typeCount = usage[txType] || 0;

    // Solo la primera vez de cada tipo es gratis
    const freeTypes = ['REQUEST', 'REFERENCE', 'CLARIFICATION', 'COMPLEMENT'];
    
    if (freeTypes.includes(txType) && typeCount === 0) {
      return { eligible: true, reason: 'First time free' };
    }

    return { 
      eligible: false, 
      reason: `${txType} already used. Purchase a package to continue.`,
      usedCount: typeCount
    };
  }

  /**
   * Registra el uso de una transacción gasless
   */
  recordUsage(referenceId, txType, txHash) {
    const allUsage = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
    
    if (!allUsage[referenceId]) {
      allUsage[referenceId] = {};
    }

    if (!allUsage[referenceId][txType]) {
      allUsage[referenceId][txType] = 0;
    }

    allUsage[referenceId][txType]++;

    // Guardar metadata de la última transacción
    allUsage[referenceId][`${txType}_last_tx`] = {
      hash: txHash,
      timestamp: new Date().toISOString()
    };

    localStorage.setItem(this.storageKey, JSON.stringify(allUsage));

    console.log(`✅ Gasless usage recorded: ${txType} for reference ${referenceId}`);
  }

  /**
   * Obtiene estadísticas de uso
   */
  getStats(referenceId) {
    const usage = this.getUsage(referenceId);
    return {
      REQUEST: usage.REQUEST || 0,
      REFERENCE: usage.REFERENCE || 0,
      CLARIFICATION: usage.CLARIFICATION || 0,
      COMPLEMENT: usage.COMPLEMENT || 0,
      totalFreeUsed: (usage.REQUEST || 0) + (usage.REFERENCE || 0) + 
                     (usage.CLARIFICATION || 0) + (usage.COMPLEMENT || 0),
      maxFree: 4
    };
  }

  /**
   * Resetea el uso (solo para testing/admin)
   */
  resetUsage(referenceId) {
    const allUsage = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
    delete allUsage[referenceId];
    localStorage.setItem(this.storageKey, JSON.stringify(allUsage));
  }
}

export default new GaslessTracker();