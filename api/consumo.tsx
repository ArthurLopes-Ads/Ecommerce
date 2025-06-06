import {useEffect, useState} from "react";
import axios from "axios";
export default app;

function app() {
    const [data, setData] = useState ([]);

    useEffect(() => {
        axios.get("https://fakestoreapi.com/products")
        .then(response => setData(response.data))
        .catch(error => console.error("Erro ao buscar os dados:", error));
    }, []);

   




