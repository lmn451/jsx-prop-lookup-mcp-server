
import React from 'react';
import { Button } from './Button';

export interface CardProps {
  title: string;
  content: string;
  onAction: () => void;
}

export const Card: React.FC<CardProps> = ({ title, content, onAction }) => {
  return (
    <div>
      <h2>{title}</h2>
      <p>{content}</p>
      <Button onClick={onAction}>Click me</Button>
    </div>
  );
};
