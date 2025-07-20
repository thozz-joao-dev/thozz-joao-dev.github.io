const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const JSONBIN_CONFIG = {
        binId: process.env.JSONBIN_BIN_ID,
        apiKey: process.env.JSONBIN_API_KEY,
        baseUrl: 'https://api.jsonbin.io/v3'
    };

    if (!JSONBIN_CONFIG.apiKey || !JSONBIN_CONFIG.binId) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Configuration JSONBin manquante',
                details: 'JSONBIN_API_KEY et JSONBIN_BIN_ID requis'
            })
        };
    }

    try {
        if (event.httpMethod === 'GET') {
            console.log('📥 GET - Chargement depuis JSONBin...');
            
            try {
                const response = await fetch(`${JSONBIN_CONFIG.baseUrl}/b/${JSONBIN_CONFIG.binId}/latest`, {
                    headers: {
                        'X-Master-Key': JSONBIN_CONFIG.apiKey,
                        'X-Bin-Meta': 'false' // On veut juste le contenu, pas les métadonnées
                    },
                    timeout: 10000
                });

                console.log(`📡 Status JSONBin GET: ${response.status}`);

                if (response.status === 404) {
                    console.log('📝 Bin non trouvé, retour données vides');
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({ conversations: [], messages: [] })
                    };
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ JSONBin error: ${response.status} - ${errorText}`);
                    throw new Error(`JSONBin error: ${response.status}`);
                }

                const data = await response.json();

                console.log('✅ Données chargées depuis JSONBin');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(data)
                };

            } catch (error) {
                console.error('❌ Erreur lecture JSONBin:', error.message);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ conversations: [], messages: [] })
                };
            }
        }

        if (event.httpMethod === 'POST') {
            console.log('📤 POST - Début sauvegarde JSONBin...');
            
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Body manquant' })
                };
            }

            let newData;
            try {
                newData = JSON.parse(event.body);
                console.log(`📊 Données: ${newData.conversations?.length || 0} conversations, ${newData.messages?.length || 0} messages`);
            } catch (parseError) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'JSON invalide',
                        details: parseError.message 
                    })
                };
            }

            // Validation structure
            if (!newData || typeof newData !== 'object' || 
                !Array.isArray(newData.conversations) || 
                !Array.isArray(newData.messages)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Structure de données invalide'
                    })
                };
            }

            try {
                // Mise à jour du bin JSONBin
                const updateResponse = await fetch(`${JSONBIN_CONFIG.baseUrl}/b/${JSONBIN_CONFIG.binId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Master-Key': JSONBIN_CONFIG.apiKey,
                        'X-Bin-Name': 'chat-data', // Nom optionnel
                        'X-Collection-Id': '$default' // Collection par défaut
                    },
                    body: JSON.stringify(newData),
                    timeout: 15000
                });

                console.log(`📡 Status JSONBin PUT: ${updateResponse.status}`);

                if (!updateResponse.ok) {
                    const errorData = await updateResponse.text();
                    console.error(`❌ JSONBin update failed: ${updateResponse.status} - ${errorData}`);
                    
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ 
                            error: 'Échec sauvegarde JSONBin',
                            status: updateResponse.status,
                            details: errorData.substring(0, 500)
                        })
                    };
                }

                const result = await updateResponse.json();
                console.log('✅ Sauvegarde JSONBin réussie');
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true,
                        storage: 'jsonbin',
                        binId: JSONBIN_CONFIG.binId,
                        timestamp: new Date().toISOString()
                    })
                };

            } catch (saveError) {
                console.error('❌ Erreur sauvegarde JSONBin:', saveError.message);
                
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Erreur lors de la sauvegarde JSONBin',
                        details: saveError.message
                    })
                };
            }
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };

    } catch (error) {
        console.error('❌ Erreur générale:', error.message);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Erreur serveur interne',
                details: error.message
            })
        };
    }
};
