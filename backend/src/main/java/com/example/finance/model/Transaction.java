package com.example.finance.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Data @NoArgsConstructor @AllArgsConstructor @Builder
@Table(name = "transactions")
public class Transaction {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDate date;
    private String merchant;
    private Double amount;
    private String category;
    private String notes;
}
