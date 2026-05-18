import { mount } from "svelte";
import App from "./App.svelte";
import "./design/tokens/index.css";
import "./design/base/index.css";

mount(App, { target: document.getElementById("app")! });