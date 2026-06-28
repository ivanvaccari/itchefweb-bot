import axios, { type AxiosInstance } from "axios";
import { environment } from "./environment.js";
import { parse } from "parse5";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

// Se la pagina di ha questo messaggio allora le credenziali sono errate
const LOGIN_FAIL_MESSAGE = "Nome utente o password errati!";

/**
 * Http scraper for the ITChefWeb application.
 * It provides methods to log in, retrieve reservations, and check if reservations are possible for specific dates.
 */
export class HttpClient {
    private httpClient: AxiosInstance;

    private clientId: string | null = null;
    private destinationId: string | null = null;
    private serviceId: string | null = null;

    private cookieJar: CookieJar;

    constructor() {
        this.cookieJar = new CookieJar();
        this.httpClient = wrapper(
            axios.create({
                jar: this.cookieJar,
            }),
        );
    }
    
    /**
     * Esegue il login. Per qualsiasi problema, lancia un eccezione,
     * altrimenti ritorna senza errori.
     *
     * @param email L'email dell'utente.
     * @param password La password dell'utente.
     * @throws Error se il login fallisce o se ci sono problemi nella pagina di login.
     * @returns void
     */
    public async login(email: string, password: string) {
        const loginPage = await this.httpClient.get(`${environment.camstBaseUrl}/Account/Login`, {
            headers: {
                ...this.fakeBrowserHeaders(),
            },
        });
        const loginPageHtml = loginPage.data;
        const loginPageAST = this.buildHtmlAST(loginPageHtml);

        // find the form element in the html AST
        const form = this.getElements(loginPageAST, "form");
        if (!form[0]) throw new Error("Elemento form non trovato nella pagina di login");

        // Find the input elements for email and password in the form
        const inputPassword = this.getElements(form[0], "input", { type: "password", name: "inputPassword" });
        if (!inputPassword[0]) throw new Error("Elemento input password non trovato nel form");
        const inputEmail = this.getElements(form[0], "input", { type: "text", name: "inputEmail" });
        if (!inputEmail[0]) throw new Error("Elemento input email non trovato nel form");

        // ASP.NET Web Forms uses hidden input fields to maintain state. We need to extract these values from the form and include them in our POST request.
        const __EVENTTARGET = this.getElements(form[0], "input", { type: "hidden", name: "__EVENTTARGET" })[0];
        const __EVENTARGUMENT = this.getElements(form[0], "input", { type: "hidden", name: "__EVENTARGUMENT" })[0];
        const __VIEWSTATE = this.getElements(form[0], "input", { type: "hidden", name: "__VIEWSTATE" })[0];
        const __VIEWSTATEGENERATOR = this.getElements(form[0], "input", { type: "hidden", name: "__VIEWSTATEGENERATOR" })[0];
        const __EVENTVALIDATION = this.getElements(form[0], "input", { type: "hidden", name: "__EVENTVALIDATION" })[0];

        // Fake a browser POST request to the login endpoint with the extracted form data and user credentials.
        const formData = new URLSearchParams();
        formData.append("__EVENTTARGET", this.getNodeAttr(__EVENTTARGET, "value") ?? "");
        formData.append("__EVENTARGUMENT", this.getNodeAttr(__EVENTARGUMENT, "value") ?? "");
        formData.append("__VIEWSTATE", this.getNodeAttr(__VIEWSTATE, "value") ?? "");
        formData.append("__VIEWSTATEGENERATOR", this.getNodeAttr(__VIEWSTATEGENERATOR, "value") ?? "");
        formData.append("__EVENTVALIDATION", this.getNodeAttr(__EVENTVALIDATION, "value") ?? "");
        formData.append("inputEmail", email);
        formData.append("inputPassword", password);
        formData.append("cmdLogin", "ENTRA");
        formData.append("txtResetPassword", "");

        const loginResponse = await this.httpClient.post(`${environment.camstBaseUrl}/Account/Login`, formData.toString(), {
            headers: {
                ...this.fakeBrowserHeaders(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        // Check for login failure by looking for a specific message in the response data. If found, throw an error indicating that the login failed.
        if (loginResponse.data.includes(LOGIN_FAIL_MESSAGE)) {
            throw new Error("Login fallito: " + LOGIN_FAIL_MESSAGE);
        }

        // chiamata per mettere alcuni cookies
        await this.httpClient.get(`${environment.camstBaseUrl}/Default`, {
            headers: {
                ...this.fakeBrowserHeaders(),
                accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                referer: `${environment.camstBaseUrl}/Account/Login`,
            },
        });
    }

    /**
     * Fakes headers that tell the remote server we're Chrome.
     * 
     * @returns An object containing the fake headers.
     */
    private fakeBrowserHeaders() {
        return {
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
            "cache-control": "no-cache",
            connection: "keep-alive",
            host: new URL(environment.camstBaseUrl!).host,
            pragma: "no-cache",

            "sec-ch-ua": '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        };
    }

    /**
     * Generates an AST (Abstract Syntax Tree) from the given HTML string.
     * 
     * @param html The HTML string to parse.
     * @returns The generated AST.
     */
    private buildHtmlAST(html: string) {
        const document = parse(html);
        return document;
    }

    /**
     * Finds an element by its tag name from the given node and its children.
     * 
     * @param node The node to search in.
     * @param tagName The tag name of the element to find.
     * @returns
     */
    private getNodeAttr(node: ReturnType<typeof this.buildHtmlAST>, attrName: string): string | undefined {
        if (!node) return undefined;
        const attr = (node as any).attrs?.find((a: any) => a.name === attrName);
        return attr?.value;
    }

    /**
     * Gets an element by its tag name from the given node and its children.
     * 
     * @param node The node to search in.
     * @param tagName The tag name of the element to find.
     * @returns The found element or null if not found.
     */
    private getElements(node: ReturnType<typeof this.buildHtmlAST>, tagName?: string, attrs?: { [k: string]: string }): any | null {
        if (!tagName && !attrs) {
            throw new Error("Either tagName or attrs must be provided");
        }
        let elements: typeof node.childNodes = [];
        for (let i = 0; i < node.childNodes?.length; i++) {
            const child = node.childNodes[i];
            if (!child) continue;

            let match = [];
            if (tagName) {
                match.push(child.nodeName === tagName);
            }
            if (attrs) {
                let _tmpMatch = [];
                for (const [key, value] of Object.entries(attrs)) {
                    const attr = (child as any).attrs?.find((a: any) => a.name === key);
                    _tmpMatch.push(attr?.value === value);
                }
                match.push(_tmpMatch.every((v) => v === true));
            }

            if (match.length && match.every((v) => v === true)) {
                elements.push(child);
            }
            const result = this.getElements(child as unknown as typeof node, tagName, attrs);
            if (result.length) elements = [...elements, ...result];
        }

        return elements;
    }

    /**
     * Get the customer id for the specified date (the one you want to book for).
     * 
     * @param date The date for which to get the customer id.
     * @returns The customer id.
     * @throws Error if no customer is found for the specified date.
     * 
     */
    private async getClientId(date: Date): Promise<string> {
        /**
         * ## Prendere id cliente

            POST ${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetClienti
            BODY POST JSON {'sData':'"2026-06-24T00:00:00"'} // data del giorno in cui si vuole prenotare

            Risposta

            {
                "d": "[{\"IdCliente\":NUMBER,\"RagioneSociale\":\"XXXXXXXXXX\",\"bDefault\":true,\"ServizioSelManuale\":0,\"DietaSelManuale\":0,\"RichiestaFattura\":0,\"RicaricaLibera\":0,\"ModalitaRicarica\":0}]"
            }
         */
        const _date = date.toISOString().split("T")[0] + "T00:00:00";

        const response = await this.httpClient.post(
            `${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetClienti`,
            { sData: `"${_date}"` },
            {
                headers: {
                    ...this.fakeBrowserHeaders(),
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest", // ← spesso richiesto dagli ASMX
                    Accept: "application/json, text/javascript, */*; q=0.01",
                },
            },
        );

        const clienti = JSON.parse(response.data.d);
        if (!clienti.length) throw new Error("Nessun cliente trovato per la data specificata");
        return clienti[0].IdCliente!;
    }

    /**
     * Get the destination id for the specified date and client id (the one you want to book for).
     * 
     * @param date The date for which to get the destination id.
     * @param clientId The client id for which to get the destination id.
     * @returns The destination id.
     * @throws Error if no destination is found for the specified client and date.
     */
    private async getClientDestination(date: Date, clientId: string): Promise<string> {
        /**
         * ## Prendere destinazione cliente

            POST ${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetDestinazioniS

            BODY POST JSON {'IdCliente':'NUMBER','sData':'"2026-06-24T00:00:00"'} // data del giorno in cui si vuole prenotare

            Risposta

            {
                "d": "[{\"IdCliente\":NUMBER,\"IdDestinazione\":NUMBER,\"Descrizione\":\"XXXXXXXXXX\",\"prenotazioneMultipla\":false,\"bDefault\":true}]"
            }

         */
        const _date = date.toISOString().split("T")[0] + "T00:00:00";
        const response = await this.httpClient.post(
            `${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetDestinazioniS`,
            {
                IdCliente: clientId,
                sData: `"${_date}"`,
            },
            {
                headers: {
                    ...this.fakeBrowserHeaders(),
                    "Content-Type": "application/json",
                },
            },
        );

        const destinazioni = JSON.parse(response.data.d);
        if (!destinazioni.length) throw new Error("Nessuna destinazione trovata per il cliente specificato");
        return destinazioni[0].IdDestinazione!;
    }

    /**
     * Get the service id for the specified date, client, and destination.
     * 
     * @param date The date for which to get the service id.
     * @param clientId The client id for which to get the service id.
     * @param destinationId The destination id for which to get the service id.
     * @throws Error if no service is found for the specified client and destination.
     * @returns
     */
    private async getServizi(date: Date, clientId: string, destinationId: string): Promise<string> {
        /*
            POST ${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetServizi
            BODY POST JSON {'IdCliente':'NUMBER','IdDestinazione':'NUMBER','sData':'"2026-06-24T00:00:00"'} // data del giorno in cui si vuole prenotare


            Risposta

            {
                "d": "[{\"IdServizio\":NUMBER,\"Descrizione\":\"Pranzo\",\"bDefault\":true,\"bFreeBuy\":false},{\"IdServizio\":NUMBER,\"Descrizione\":\"Merci palmare\",\"bDefault\":false,\"bFreeBuy\":false}]"
            }

        */

        const _date = date.toISOString().split("T")[0] + "T00:00:00";
        const response = await this.httpClient.post(
            `${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetServizi`,
            { IdCliente: clientId, IdDestinazione: destinationId, sData: `"${_date}"` },
            {
                headers: {
                    ...this.fakeBrowserHeaders(),
                    "Content-Type": "application/json",
                },
            },
        );

        const servizi = JSON.parse(response.data.d);
        if (!servizi.length) throw new Error("Nessun servizio trovato per il cliente e la destinazione specificati");
        return servizi[0].IdServizio!;
    }
    /**
     * PReloads the dataset necessary to make a reservation for the specified date.
     * 
     * @param date The date for which to preload the dataset.
     */
    private async preloadDatasetForDate(date: Date) {
        this.clientId = await this.getClientId(date);
        this.destinationId = await this.getClientDestination(date, this.clientId);
        this.serviceId = await this.getServizi(date, this.clientId, this.destinationId);
    }

    /**
     * Find the reservation for the specified date. If the dataset has not been preloaded, it does so automatically.
     * 
     * @param date The date for which to find the reservation.
     * @returns An object containing the reservation status and details.
     */
    public async getReservation(date: Date): Promise<{ found: boolean; data: any, isReservationPossible?: boolean; message: string }> {
        if (!this.clientId || !this.destinationId || !this.serviceId) {
            await this.preloadDatasetForDate(date);
        }

        /**
         * POST ${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetPrenotazione

        BODY POST JSON {'IdCliente':'NUMBER','IdDestinazione':'NUMBER','IdServizio':'NUMBER','sData':'"2026-06-24T00:00:00"'}


        Risposta NOn prenotato:
        {d: "[]"}

        Risposta prenotato 
        {
                "d": "[{\"Data\":\"2026-06-24T00:00:00\",\"IdCliente\":NUMBER,\"IdDestinazione\":NUMBER,\"IdUtente\":NUMBER,\"IdRotazione\":NUMBER,\"IdDieta\":NUMBER,\"IdServizio\":NUMBER,\"IdPuntoRitiro\":NUMBER,\"Prenotazione\":....}}]}]"
            }
         */

        const _date = date.toISOString().split("T")[0] + "T00:00:00";
        const response = await this.httpClient.post(
            `${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetPrenotazione`,
            { IdCliente: this.clientId, IdDestinazione: this.destinationId, IdServizio: this.serviceId, sData: `"${_date}"` },
            {
                headers: {
                    ...this.fakeBrowserHeaders(),
                    "Content-Type": "application/json",
                },
            },
        );

        const prenotazioni = JSON.parse(response.data.d);
        if (!prenotazioni.length) {
            const dietId = await this.getDietId(date);
            const isReservationPossible = await this.isReservationPossible(date, dietId);
            return {
                found: false,
                isReservationPossible: isReservationPossible.isPossible,
                message: isReservationPossible.message,
                data: null,
            };
        } else {
            return {
                found: true,
                data: prenotazioni[0],
                message: prenotazioni[0].Prenotazione?.map((p: any) => p.DescrPiatto).join(", ") || "",
            };
        }
    }

    /**
     * Find the diet for the specified date, client, destination and service.
     * 
     * @param date The date for which to get the diet.
     * @param clientId The client id for which to get the diet.
     * @param destinationId The destination id for which to get the diet.
     * @param serviceId The service id for which to get the diet.
     * @throws Error if no diet is found for the specified client, destination and service.
     * @returns The id of the diet.
     */
    private async getDietId(date: Date): Promise<string> {
        /**
         * POST ${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetDiete
            BODY {'IdCliente':'NUMBER','IdDestinazione':'NUMBER','IdServizio':'NUMBER','sData':'"2026-06-22T00:00:00"'}

            response    
            {
                "d": "[{\"IdDieta\":NUMBER,\"Descrizione\":\"XXXXXXX\",\"bDefault\":true,\"bPrenotata\":true}]"
            }
         */

        const _date = date.toISOString().split("T")[0] + "T00:00:00";
        const response = await this.httpClient.post(
            `${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetDiete`,
            { IdCliente: this.clientId, IdDestinazione: this.destinationId, IdServizio: this.serviceId, sData: `"${_date}"` },
            {
                headers: {
                    ...this.fakeBrowserHeaders(),
                    "Content-Type": "application/json",
                },
            },
        );

        const diete = JSON.parse(response.data.d);
        if (!diete.length) throw new Error("Nessuna dieta trovata per il cliente, la destinazione e il servizio specificati");
        return diete[0].IdDieta!;
    }

    /**
     * Checks if a reservation is possible for the specified date and diet.
     * 
     * @param date The date for which to check if a reservation is possible.
     * @param dietId The diet id for which to check if a reservation is possible.
     * @returns An object containing the result of the check, a message, and whether deletion is allowed.
     */
    private async isReservationPossible(date: Date, dietId: string): Promise<{ isPossible: boolean; message: string; allowDelete: boolean }> {
   
        /**
         * POST ${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetVerificaPrenotazionePossibile

        {'IdCliente':'NUMBER','IdDestinazione':'NUMBER','IdServizio':'NUMBER','IdDieta':'NUMBER','sData':'"2026-06-23T00:00:00"'}

        Risposta per prenotato no modificabile
        {
            "d": "{\"IdErrore\":2,\"Messaggio\":\"Non è possibile modificare le prenotazioni per la data selezionata.\",\"ConsentiEliminazione\":0}"
        }

        Risposta prenotato modificabile
        {"d":"{\"IdErrore\":0,\"Messaggio\":\"\",\"ConsentiEliminazione\":0}"}

        Risposta Non prenotato
        {"d":"{\"IdErrore\":0,\"Messaggio\":\"\",\"ConsentiEliminazione\":0}"}

         */

        const _date = date.toISOString().split("T")[0] + "T00:00:00";

        const response = await this.httpClient.post(
            `${environment.camstBaseUrl}/LocalServiceInterface.asmx/GetVerificaPrenotazionePossibile`,
            { IdCliente: this.clientId, IdDestinazione: this.destinationId, IdServizio: this.serviceId, IdDieta: dietId, sData: `"${_date}"` },
            {
                headers: {
                    ...this.fakeBrowserHeaders(),
                    "Content-Type": "application/json",
                },
            },
        );
        const result = JSON.parse(response.data.d);
        return {
            isPossible: result.IdErrore === 0,
            message: result.Messaggio,
            allowDelete: result.ConsentiEliminazione === 1,
        };
    }
}
