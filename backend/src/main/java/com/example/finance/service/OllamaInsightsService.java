package com.example.finance.service;

import com.example.finance.model.Transaction;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import com.example.finance.repo.TransactionRepository;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

@Service
@ConditionalOnProperty(value = "app.ai.ollama.enabled", havingValue = "true")
@RequiredArgsConstructor
public class OllamaInsightsService implements InsightsService {

    private final TransactionRepository repo;

    @Value("${app.ai.ollama.base-url:http://localhost:11434}")
    private String baseUrl;

    @Value("${app.ai.ollama.model:llama3.1:8b}")
    private String model;

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String summarizeMonth(YearMonth month) {
        LocalDate start = month.atDay(1), end = month.atEndOfMonth();
        List<Transaction> tx = repo.findByDateBetween(start, end);
        if (tx.isEmpty()) return "No spending recorded for " + month + ".";

        Map<String, Double> byCat = tx.stream().collect(Collectors.groupingBy(
                t -> Optional.ofNullable(t.getCategory()).orElse("Uncategorized"),
                Collectors.summingDouble(t -> Optional.ofNullable(t.getAmount()).orElse(0.0))
        ));
        String topCat = byCat.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse("N/A");
        double total = tx.stream().mapToDouble(t -> Optional.ofNullable(t.getAmount()).orElse(0.0)).sum();
        String sampleMerchants = tx.stream().map(Transaction::getMerchant)
                .filter(Objects::nonNull).limit(5).collect(Collectors.joining(", "));

        String prompt = String.format(
                "You are a concise finance assistant. Given this month's totals, write ONE short sentence summarizing spending.%n" +
                        "Include: top category, total amount, and one suggestion to optimize.%n%n" +
                        "Month: %s%nTotal: $%.2f%nTop Category: %s%nSample Merchants: %s%n",
                month, total, topCat, sampleMerchants
        );

        try {
            HttpClient client = HttpClient.newHttpClient();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", model);
            payload.put("prompt", prompt);
            payload.put("stream", false);

            String body = mapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/generate"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> resp = client.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode json = mapper.readTree(resp.body());
            String out = json.hasNonNull("response") ? json.get("response").asText() : null;
            if (out == null || out.isBlank()) throw new RuntimeException("Empty response");
            return out.trim();
        } catch (Exception e) {
            return "[LLM offline → fallback] " + new RuleBasedInsightsService(repo).summarizeMonth(month);
        }
    }
}
