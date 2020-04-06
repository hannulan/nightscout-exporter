/// <reference path="../typings/ReactDateTimeRangePicker.d.ts" />
import * as React from "react";
import * as _ from "underscore";
import {
    Container,
    FormControl,
    InputGroup,
    ButtonToolbar,
    Button,
    FormCheck,
    FormLabel,
    Alert,
    Spinner
} from "react-bootstrap";
import { StyleSheet} from 'react-native';
import { hot } from "react-hot-loader";
import { ExportFormats, converterFactory } from "../utils/Converter";
import * as fileSaver from "file-saver";
import * as url from "url";
import * as urlParseLax from "url-parse-lax";
import DateTimeRangePicker from "@wojtekmaj/react-datetimerange-picker";
import { sha1 } from "../utils/Crypto";
import { processData } from "../utils/Processor";

'use strict';
// const reactLogo = require("./../assets/img/react_logo.svg");

export interface IOptions {
    semicolonSeparated?: boolean;
}

interface IState {
    apiSecret: string;
    error: string | undefined;
    format: ExportFormats;
    range: Date[];
    url: string;
    working: boolean;
    options: IOptions;
}

class App extends React.Component<{}, IState> {
    constructor(props: {}) {
        super(props);
        const today = new Date();
        let storedState = {};

        try {
            storedState = JSON.parse(localStorage.getItem("state"));
        } catch (e) {
            // don't do anything, it's fine
        }

        this.state = Object.assign({
            apiSecret: "",
            error: undefined,
            format: ExportFormats.XLSX,
            options: {},
            range: [
                new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
                new Date(today.getFullYear(), today.getMonth(), today.getDate()),
            ],
            url: "",
            working: false,
        }, storedState);
    }

    public render() {
      /*const page = StyleSheet.create({
        container: {
          flex: 1,
          padding: 24,
          backgroundColor: '#fff',
        },
        text: {
          fontSize: 30,
          color: '#000'
        },
      });*/
      /*const styles = StyleSheet.create({
            title: {
              textAlign: 'center',
              marginVertical: 8
            }
          });*/
        return (
            <div className="app">
                <Container className="mt-5 mb-5">
                    <h1>Nightscout Exporter</h1>
                    <FormLabel htmlFor="url">
                        Nightscout API endpoint URL
                    </FormLabel>
                    <InputGroup className="mb-2">
                        <FormControl
                            id="url"
                            value={this.state.url}
                            onChange={(e) => this.changeUrl(e)}
                            placeholder="https://YOUR-OWN-NIGHTSCOUT-URL/api/" />
                    </InputGroup>
                    <FormLabel htmlFor="apiSecret">
                        Nightscout API Secret <em>(only required if the Nightscout instance has customized authentication rules)</em>
                    </FormLabel>
                    <InputGroup className="mb-2">
                        <FormControl
                            id="apiSecret"
                            type="password"
                            value={this.state.apiSecret}
                            onChange={(e) => this.changeApiSecret(e)} />
                    </InputGroup>
                    <FormLabel>
                        Date range
                    </FormLabel>
                    <div className="mb-3">
                        <DateTimeRangePicker
                            format="y-MM-dd h:mm:ss a"
                            value={this.state.range}
                            onChange={(e) => this.changeRange(e)} />
                    </div>
                    <div className="mb-3">
                        {_.keys(ExportFormats).map((key) =>
                            <FormCheck
                                custom
                                type="radio"
                                label={key}
                                id={key}
                                key={key}
                                checked={this.state.format === ExportFormats[key]}
                                onChange={(e) => this.changeFormat(e, ExportFormats[key])} />)}
                    </div>
                    <div className="mb-3">
                        <FormCheck
                            custom
                            type="checkbox"
                            label="Use semicolons instead of comma separators in CSV"
                            id="semicolonSeparated"
                            checked={this.state.options.semicolonSeparated === true}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                this.changeOption(e, "semicolonSeparated", !!e.target.checked);
                            }} />
                    </div>
                    <ButtonToolbar className="mb-3">
                        <Button variant="primary" onClick={(e) => this.fetchAndConvertEntries()}>Export Entries</Button>
                        {this.state.working && ".."}
                        <Button variant="primary" onClick={(e) => this.fetchAndConvertTreatments()}>Export Treatments</Button>
                        {this.state.working && <Spinner animation="border" bsPrefix="ml-3 mt-1 spinner" />}
                    </ButtonToolbar>
                    {this.state.error &&
                        <Alert variant="danger">{this.state.error}</Alert>
                    }
                </Container>
            </div>
        );
    }

    public componentDidUpdate() {
        localStorage.setItem("state", JSON.stringify(_.omit(this.state, [
            "error",
            "range",
            "working",
        ])));
    }

    private changeOption(e: React.ChangeEvent<HTMLInputElement>, option: string, value: any) {
        const obj = {};
        obj[option] = value;
        this.setState({ options: obj });
    }

    private changeRange(e: Date[]) {
        this.setState({
            range: e,
        });
    }

    private changeFormat(e: React.ChangeEvent<HTMLInputElement>, format: ExportFormats) {
        this.setState({
            format,
        });
    }

    private changeApiSecret(e: React.ChangeEvent<HTMLInputElement>) {
        this.setState({
            apiSecret: e.currentTarget.value,
        });
    }

    private changeUrl(e: React.ChangeEvent<HTMLInputElement>) {
        this.setState({
            url: e.currentTarget.value,
        });
    }

    private isWorking(working: boolean) {
        this.setState({
            error: working ? undefined : this.state.error,
            working,
        });
    }

    private buildUrl(apiUrl: string, begin: Date, end: Date, treatmentsOnOff: boolean): string {
        if (!apiUrl.endsWith("/")) {
            apiUrl += "/";
        }
        let apiCall: string = "";
        if (treatmentsOnOff == false) {
            apiCall = url.format(urlParseLax(apiUrl)) +
                "v1/entries.json?find[dateString][$gte]=" +
                begin.toISOString() +
                "&find[dateString][$lt]=" +
                end.toISOString() +
                "&count=1000";
        } else {
          apiCall = url.format(urlParseLax(apiUrl)) +
              "v1/treatments.json?find[created_at][$gte]=" +
              begin.toISOString() +
              "&find[created_at][$lt]=" +
              end.toISOString() +
              "&count=1000";
        }
        return apiCall;
    }

    private async fetchAll(apiUrl: string, treatmentsOnOff: boolean, init?: RequestInit): Promise<object[]> {
        const begin = this.state.range[0];
        console.log("treatmentsOnOff: " + treatmentsOnOff);
        const indexCount: number = 0;
        let end = this.state.range[1];
        let data: any[] = [];
        let allData: any[] = [];
        const count: number = 1000;
        do {
            const urlString: string = this.buildUrl(apiUrl, begin, end, treatmentsOnOff);
            console.log("urlString: " + urlString);
            const response  = await fetch(urlString, init);
            if (!response.ok) {
                throw new Error(`Server responded with an error: ${response.status} ${response.statusText}`);
            }
            data = await response.json();
            allData = allData.concat(data);
            let lastDate;
            if (!treatmentsOnOff) {
              lastDate = allData[allData.length - 1].date;
            } else {
              lastDate = allData[allData.length - 1].created_at;
            }
            end = new Date(lastDate);
        } while (data.length >= count);
        return allData;
    }

    private async fetchAndConvertBundle() {
      this.fetchAndConvert(false);
      this.fetchAndConvert(true);
    }
    private async fetchAndConvertEntries() {
      this.fetchAndConvert(false);
    }
    private async fetchAndConvertTreatments() {
      this.fetchAndConvert(true);
    }

    private async fetchAndConvert(treatmentsOnOff: boolean) {
        this.isWorking(true);
        const headers = new Headers();
        if (this.state.apiSecret) {
            const hash = await sha1(this.state.apiSecret);
            headers.set("API-SECRET", hash);
        }
        this.fetchAll(this.state.url, treatmentsOnOff, {
            cache: "no-cache",
            headers,
            method: "GET",
            mode: "cors",
        }).catch((err) => {
            this.setState({
                error: "An error happened while trying to query Nightscout: " +
                    (typeof err === "string" ? err : err.toString()),
                working: false,
            });
            throw new Error();
        }).then((data: object[]) => { // If no error occur, do this
            if (typeof data.length !== "number") {
                throw new Error("Unexpected response from Nightscout");
            }

            data = processData(data);
            const columns = _.keys(data[0]);
            const converter = converterFactory(this.state.format, columns, data, this.state.options);
            const hostName = (urlParseLax(this.state.url).hostname) || "unknown";

            const blob = converter.convert();
            fileSaver.saveAs(blob, hostName + "." + converter.extension);
            this.setState({
                error: undefined,
                working: false,
            });
        }).catch((err) => {
            if (!this.state.error) {
                this.setState({
                    error: "An error happened while trying to parse data from Nightscout: " +
                        (typeof err === "string" ? err : err.toString()),
                    working: false,
                });
            }
        });
    }
}

declare let module: object;

export default hot(module)(App);
